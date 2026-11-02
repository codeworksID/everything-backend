#!/usr/bin/env node
"use strict";
// security-scan: ignore-file this file is the rule table and matches its own patterns

// Static security scanner for backend code. Zero dependencies.
//
// Finds the insecure patterns banned by _shared/secure-coding.md and
// _shared/sql-safety.md: string-built SQL, unsafe raw query APIs, command
// injection, eval, unsafe deserialization, XXE, disabled TLS checks, weak
// crypto and randomness, JWT misuse, hardcoded secrets, CORS, mass assignment,
// SSRF, path traversal, open redirects, XSS/SSTI sinks, NoSQL operator
// injection, user-controlled regexes, leaking errors, secrets in logs, and
// CI/Docker supply-chain risks.
//
// A hit is a lead, not a verdict: read it in context. It is fast and line
// based, so it misses multi-line and cross-file flows; it does not replace
// reading the changed code, SAST (semgrep) or the negative tests.
//
// Usage:
//   node security-scan.js [paths...]            scan files or folders (default: .)
//   node security-scan.js --changed [--base ref] scan files changed vs ref (default HEAD) plus untracked
//   options: --json  --fail-on critical|high|medium|low (default high)
//            --include-tests (apply every rule to test files; default: secret formats only)
//            --include-vendored (also scan minified, vendored and generated files)
//   exit 0 = no finding at or above --fail-on, 1 = findings, 2 = usage error
//
// Suppress a reviewed false positive on the same line or the line above:
//   // security-scan: ignore <rule-id> <reason of at least 10 characters>
// A suppression without a reason is itself reported. A whole file (for
// example a scanner's own rule table) is skipped by putting this in its
// first 20 lines; skipped files are always listed in the summary:
//   // security-scan: ignore-file <reason of at least 10 characters>
//
// Secret values are never printed: matches of secret rules are redacted.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SEVERITIES = ["low", "medium", "high", "critical"];
const rank = (s) => SEVERITIES.indexOf(s);

const LANG_BY_EXT = {
  ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js", ".ts": "js", ".tsx": "js", ".mts": "js", ".cts": "js",
  ".py": "py",
  ".go": "go",
  ".java": "java", ".kt": "java", ".kts": "java", ".scala": "java",
  ".cs": "cs",
  ".rb": "rb",
  ".php": "php",
  ".xml": "xml",
  ".yml": "yaml", ".yaml": "yaml",
  ".json": "config", ".toml": "config", ".ini": "config", ".properties": "config", ".tf": "config", ".env": "config",
  ".sh": "shell", ".bash": "shell", ".ps1": "shell",
};
const CODE = ["js", "py", "go", "java", "cs", "rb", "php"];
const ALL = [...CODE, "xml", "yaml", "config", "shell", "docker"];

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", "vendor", ".venv", "venv", "env",
  "__pycache__", ".next", ".nuxt", "target", "bin", "obj", ".terraform", ".gradle", ".idea", ".vscode",
]);
const MAX_FILE_BYTES = 1024 * 1024;

function langOf(file) {
  const base = path.basename(file).toLowerCase();
  if (base === "dockerfile" || base.startsWith("dockerfile.") || base.endsWith(".dockerfile")) return "docker";
  if (base === ".env" || base.startsWith(".env.")) return null; // secrets belong there; see backend-security for tracked .env files
  return LANG_BY_EXT[path.extname(base)] || null;
}

function isTestFile(file) {
  const p = file.replace(/\\/g, "/").toLowerCase();
  return (
    /(^|\/)(tests?|__tests__|spec|specs|fixtures?|testdata|e2e)\//.test(p) ||
    /\.(test|spec)\.[a-z]+$/.test(p) ||
    /_test\.(go|py)$/.test(p) ||
    /(^|\/)test_[^/]+\.py$/.test(p) ||
    /(^|\/)conftest\.py$/.test(p)
  );
}

// Vendored libraries and generated code are not the project's code.
function isVendored(file, text) {
  const p = file.replace(/\\/g, "/").toLowerCase();
  if (/\.(?:min|bundle|chunk)\.(?:js|mjs|cjs)$/.test(p)) return true;
  if (/(^|\/)(?:jquery|ckeditor|tinymce|vue|react(?:-dom)?|angular|bootstrap|lodash|underscore|moment|alpine|d3|chart)(?:[.-][\w.-]*)?\.js$/.test(p)) return true;
  if (/(^|\/)(?:external-dependencies|third[_-]?party|generated|prisma-client|\.prisma|bootstrap\/cache|storage\/framework|public\/(?:js|vendor|lib)|static\/(?:vendor|lib)|assets\/(?:vendor|lib))\//.test(p)) return true;
  const head = String(text).slice(0, 600);
  if (/^\s*\/\*!/.test(head) && /\.(?:js|mjs|cjs|ts)$/.test(p)) return true;
  return /@generated\b|Code generated .* DO NOT EDIT|auto-?generated|This file was generated|@license\b/i.test(head);
}

// Fragments reused by several rules.
const REQ_JS = String.raw`(?:req|request|ctx\.request|ctx)\.(?:body|query|params|headers|cookies)`;
const REQ_PY = String.raw`request\.(?:args|form|values|json|GET|POST|data|query_params|path_params|headers|cookies|get_json\(\))`;
const REQ_ANY = String.raw`(?:${REQ_JS}|${REQ_PY}|\$_(?:GET|POST|REQUEST|COOKIE)|params\[|r\.(?:URL\.Query|FormValue|PostFormValue)|c\.(?:Query|Param|PostForm|FormValue)\()`;
const SQL_KW = String.raw`\b(?:SELECT\s[\s\S]*?\sFROM|INSERT\s+INTO|UPDATE\s+[\w."\x60\[\]]+\s+SET|DELETE\s+FROM|MERGE\s+INTO|REPLACE\s+INTO|WHERE\s+[\w."\x60]+\s*(?:=|<|>|LIKE|IN\b)|ORDER\s+BY|GROUP\s+BY|CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE|DROP\s+(?:TABLE|INDEX))`;
// A quoted string literal (double or single) that contains SQL.
const SQL_STR = String.raw`(?:"[^"\n]*` + SQL_KW + String.raw`[^"\n]*"|'[^'\n]*` + SQL_KW + String.raw`[^'\n]*')`;
const SECRET_WORD = String.raw`(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|auth|credential|session|otp|nonce|salt|reset)`;

// Each rule: id, severity, langs, re (tested per line), msg, ref (rule set
// citation). Optional: secret (redact output), tests (also runs on test files),
// fileRe (a second regex that must match somewhere in the file),
// notRe (skip the line when it matches), check(line, lang) (extra filter:
// return false to drop the hit).
const RULES = [
  // ---- SQL / query injection (sql-safety.md)
  { id: "sql-template-literal", severity: "critical", langs: ["js"], ref: "sql-safety 1",
    re: new RegExp("`[^`]*" + SQL_KW + "[^`]*\\$\\{", "i"),
    notRe: /(?:\bsql|\$queryRaw|\$executeRaw|Prisma\.sql|\bSQL|\bcss|\bhtml|\bgql)\s*`/,
    // Only CONSTANT_CASE interpolations (fixed identifiers) is a lead, not injection.
    check: (line) => !(line.match(/\$\{[^}]*\}/g) || []).every((m) => /^\$\{\s*[A-Z][A-Z0-9_]*(?:\.length)?\s*\}$/.test(m)),
    msg: "SQL built with a template literal; use bound parameters ($1, ?) or a tagged sql`` template" },
  { id: "sql-concatenation", severity: "critical", langs: CODE, ref: "sql-safety 1",
    re: new RegExp(SQL_STR + "\\s*(?:\\+|\\.\\s*\\$|\\.\\.|<<)\\s*[\\w$(]", "i"),
    msg: "SQL built by string concatenation; pass values as bound parameters" },
  { id: "sql-format-string", severity: "critical", langs: ["py", "go", "java", "cs", "rb", "php"], ref: "sql-safety 1",
    re: new RegExp(
      "(?:\\bf[\"'][^\"']*" + SQL_KW + "[^\"']*\\{" +
      "|" + SQL_STR + "\\s*(?:%\\s*[\\w(]|\\.format\\()" +
      "|(?:Sprintf|String\\.format|string\\.Format|format!)\\(\\s*[\"'`][^\"'`]*" + SQL_KW +
      "|\\$\"[^\"]*" + SQL_KW + "[^\"]*\\{" +
      "|\"[^\"]*" + SQL_KW + "[^\"]*#\\{" +
      "|\"[^\"]*" + SQL_KW + "[^\"]*\\$[A-Za-z_])", "i"),
    notRe: /\bFromSql(?:Interpolated)?\s*\(\s*\$"|\bExecuteSql(?:Interpolated)?(?:Async)?\s*\(\s*\$"/,
    msg: "SQL built with string formatting or interpolation; pass values as bound parameters" },
  { id: "sql-unsafe-raw-api", severity: "high", langs: CODE, ref: "sql-safety 7",
    re: /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(|\bPrisma\.raw\s*\(|\bsql\.raw\s*\(|\bsequelize\.literal\s*\(|\b(?:FromSqlRaw|ExecuteSqlRaw(?:Async)?)\s*\(\s*(?!")|\bJpaSort\.unsafe\s*\(|\bArel\.sql\s*\(|\bDB::raw\s*\(\s*\$|\b(?:whereRaw|orderByRaw|havingRaw|selectRaw)\s*\(\s*(?:\$|`[^`]*\$\{|"[^"]*\$)|\bliteral_column\s*\(\s*[a-z_]|\.order_by\s*\(\s*text\s*\(\s*[a-z_]|\.extra\s*\(\s*where\s*=\s*\[\s*f["']/i,
    msg: "unsafe raw-SQL API; use the bound variant, or allowlist the identifier and say so in a comment" },
  { id: "sql-order-by-input", severity: "high", langs: CODE, ref: "sql-safety 2",
    re: new RegExp("\\.(?:orderBy|order_by|order|OrderBy|Order|sort|group|Group|select|Select|pluck|Table)\\s*\\(\\s*" + REQ_ANY, "i"),
    msg: "identifier (sort/column/table) taken from the request; map it through a fixed allowlist" },
  { id: "mybatis-dollar-substitution", severity: "high", langs: ["xml", "java"], ref: "sql-safety 7",
    re: /\$\{\s*(?!_parameter\b)[\w.]+\s*\}/, fileRe: /<(?:select|insert|update|delete|mapper)\b|@(?:Select|Update|Insert|Delete)\s*\(/,
    msg: "MyBatis ${} is string substitution; use #{} (only allowlisted identifiers may use ${})" },
  { id: "nosql-operator-injection", severity: "high", langs: ["js", "py", "php"], ref: "sql-safety 9",
    re: new RegExp("\\.(?:find|findOne|find_one|findOneAndUpdate|updateOne|update_one|updateMany|deleteOne|deleteMany|delete_one|delete_many|countDocuments|count_documents|aggregate)\\s*\\(\\s*(?:" + REQ_JS + "|" + REQ_PY + ")\\s*[,)]"),
    msg: "request object used directly as a MongoDB filter; build the filter from typed scalars (rejects {\"$ne\": null})" },
  { id: "nosql-where-operator", severity: "high", langs: ["js", "py", "php", "java"], ref: "sql-safety 9",
    re: /["']?\$(?:where|function|accumulator)["']?\s*:/,
    msg: "$where/$function run JavaScript inside MongoDB; never use them with request data" },

  // ---- Command and code injection (secure-coding S4, S8)
  { id: "cmd-shell-js", severity: "critical", langs: ["js"], ref: "secure-coding S4",
    re: /\b(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|["'][^"']*["']\s*\+|[a-z_$][\w$.]*\s*[,)])/i,
    notRe: /\.exec\s*\(|\bRegExp\b|\bdb\.exec|\bstmt\.exec|\bsql\.exec/i,
    msg: "child_process exec runs a shell; use execFile/spawn with an argument array and no shell" },
  { id: "cmd-shell-true", severity: "high", langs: ["js", "py"], ref: "secure-coding S4",
    re: /\bshell\s*[:=]\s*(?:true|True)\b/,
    msg: "shell enabled for a child process; pass an argument array with shell off" },
  { id: "cmd-shell-py", severity: "critical", langs: ["py"], ref: "secure-coding S4",
    re: /\bos\.(?:system|popen|exec[lv]p?e?)\s*\(\s*(?:f["']|["'][^"']*["']\s*(?:%|\+|\.format)|[a-z_][\w.]*\s*\))|\bsubprocess\.\w+\s*\(\s*f["']|\bcommands\.getoutput\s*\(/,
    msg: "shell command built from a string; use subprocess.run([...]) with an argument list and shell=False" },
  { id: "cmd-shell-go", severity: "high", langs: ["go"], ref: "secure-coding S4",
    re: /\bexec\.Command(?:Context)?\s*\((?:\s*ctx\s*,)?\s*"(?:sh|bash|zsh|cmd|cmd\.exe|powershell|pwsh)"\s*,\s*"(?:-c|\/c|-Command)"/,
    msg: "exec.Command through a shell; call the program directly with separate arguments" },
  { id: "cmd-runtime-exec", severity: "high", langs: ["java"], ref: "secure-coding S4",
    re: /\bRuntime\.getRuntime\(\)\.exec\s*\(\s*(?:[a-z_]\w*\s*\)|"[^"]*"\s*\+)|new\s+ProcessBuilder\s*\(\s*"(?:sh|bash|cmd(?:\.exe)?)"\s*,\s*"(?:-c|\/c)"/i,
    msg: "OS command built from a string or run through a shell; use ProcessBuilder with a fixed program and separate arguments" },
  { id: "cmd-shell-php-rb", severity: "critical", langs: ["php", "rb"], ref: "secure-coding S4",
    re: /\b(?:system|shell_exec|passthru|exec|popen|proc_open)\s*\(\s*(?:"[^"]*(?:\$|#\{)|["'][^"']*["']\s*\.\s*\$|[^"')]*\$\w)|`[^`]*(?:#\{|\$\w)[^`]*`|%x[({][^)}]*#\{/,
    check: (line, lang) => lang === "rb" || /\b(?:system|shell_exec|passthru|exec|popen|proc_open)\s*\(/.test(line),
    msg: "shell command with interpolated input; use an argument array (escapeshellarg is not enough for options)" },
  { id: "code-eval", severity: "critical", langs: ["js", "py", "php", "rb"], ref: "secure-coding S8",
    re: /(?<![\w.$])(?:eval|exec)\s*\(\s*(?!["'`][^"'`$]*["'`]\s*\))|\bnew\s+Function\s*\(|\bvm\.(?:runInNewContext|runInThisContext|runInContext|compileFunction)\s*\(|\bsetTimeout\s*\(\s*["'`]|\b(?:instance_eval|class_eval|module_eval)\s*\(\s*[a-z"]|\bcreate_function\s*\(|\bassert\s*\(\s*\$/,
    notRe: /\b(?:re|regex|pattern|stmt|cursor|db|conn|client)\.exec\s*\(|\.exec\s*\(/i,
    msg: "dynamic code execution; never evaluate data, use a parser or a lookup table" },
  { id: "ssti-template-from-input", severity: "critical", langs: ["py", "js", "java", "rb", "php"], ref: "secure-coding S8",
    re: new RegExp("\\b(?:render_template_string|Template|from_string|Environment\\(\\)\\.from_string|ejs\\.render|pug\\.render|pug\\.compile|Handlebars\\.compile|nunjucks\\.renderString|_\\.template|ERB\\.new|Velocity\\.evaluate|twig->createTemplate)\\s*\\(\\s*(?:" + REQ_ANY + "|f[\"'])"),
    msg: "template compiled from request data (SSTI); render a fixed template and pass data as context" },

  // ---- Deserialization and parsers (secure-coding S7)
  { id: "unsafe-deserialization", severity: "critical", langs: CODE, ref: "secure-coding S7",
    re: /\b(?:c?[Pp]ickle|dill|cloudpickle|joblib|shelve|marshal)\.(?:loads?|Unpickler|open)\s*\(|\bjsonpickle\.decode\s*\(|\byaml\.unsafe_load\s*\(|\byaml\.load\s*\((?![^)]*Loader\s*=\s*(?:yaml\.)?(?:Safe|CSafe|Base)Loader)|\bnew\s+ObjectInputStream\s*\(|\bXMLDecoder\s*\(|\b(?:enableDefaultTyping|activateDefaultTyping)\s*\(|\bnew\s+(?:BinaryFormatter|NetDataContractSerializer|LosFormatter|SoapFormatter|ObjectStateFormatter)\s*\(|TypeNameHandling\s*=\s*TypeNameHandling\.(?:All|Auto|Objects|Arrays)|\bunserialize\s*\(\s*\$|\bMarshal\.load\s*\(|\bYAML\.(?:unsafe_load|load)\s*\(|require\(\s*["']node-serialize["']\)|\btorch\.load\s*\(/,
    msg: "deserializer that can construct arbitrary objects or run code; use JSON or a safe loader with an explicit schema" },
  { id: "xxe-parser", severity: "high", langs: CODE, ref: "secure-coding S7",
    re: /resolve_entities\s*=\s*True|\bXMLParser\s*\([^)]*(?:load_dtd|no_network)\s*=\s*(?:True|False)|DtdProcessing\s*=\s*DtdProcessing\.Parse|XmlResolver\s*=\s*new\s+XmlUrlResolver|\bLIBXML_NOENT\b|\bnoent\s*:\s*true|\bsetExpandEntityReferences\s*\(\s*true|ProhibitDtd\s*=\s*false/,
    msg: "XML parser with entity expansion or DTD processing enabled (XXE); disable DTDs and external entities (Python: defusedxml)" },
  { id: "xxe-java-factory", severity: "medium", langs: ["java"], ref: "secure-coding S7",
    re: /\b(?:DocumentBuilderFactory|SAXParserFactory|XMLInputFactory|TransformerFactory|SchemaFactory)\.newInstance\s*\(/,
    fileRe: /^(?![\s\S]*(?:disallow-doctype-decl|FEATURE_SECURE_PROCESSING|SUPPORT_DTD|ACCESS_EXTERNAL_DTD|external-general-entities))/,
    msg: "Java XML factory without DTD/external-entity hardening in this file (XXE); set disallow-doctype-decl" },

  // ---- Transport and crypto (secure-coding S12)
  { id: "tls-verification-disabled", severity: "high", langs: ALL, ref: "secure-coding S12",
    re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*[=:]\s*["']?0|\bverify\s*=\s*False\b|\bssl\s*=\s*False\b|_create_unverified_context|check_hostname\s*=\s*False|CERT_NONE|InsecureSkipVerify\s*:\s*true|ServerCertificateCustomValidationCallback\s*=\s*\([^)]*\)\s*=>\s*true|ServerCertificateValidationCallback\s*[+]?=\s*[^;]*=>\s*true|DangerousAcceptAnyServerCertificateValidator|NoopHostnameVerifier|ALLOW_ALL_HOSTNAME_VERIFIER|TrustAllCerts|X509TrustManager\s*\(\s*\)\s*\{|CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*,\s*(?:false|0)|verify_mode\s*=\s*OpenSSL::SSL::VERIFY_NONE|sslmode\s*=\s*disable|--insecure\b|curl\s+(?:[^|\n]*\s)?-k\b/,
    msg: "TLS certificate or hostname verification disabled; fix the trust store instead (never in production code)" },
  { id: "weak-password-hash", severity: "critical", langs: CODE, ref: "secure-coding S11",
    re: /(?:md5|sha1|sha256|sha512|sha-?1|sha-?256|MessageDigest\.getInstance\s*\(\s*"(?:MD5|SHA-?1|SHA-?256)")[^\n]*\b(?:password|passwd|pwd)\b|\b(?:password|passwd|pwd)\b[^\n]*(?:\bmd5\b|\bsha1\b|createHash\s*\(\s*["']sha(?:1|256|512)["']|hashlib\.sha(?:1|256|512)\s*\()/i,
    notRe: /\b(?:argon2|bcrypt|scrypt|pbkdf2|PBKDF2|Rfc2898DeriveBytes|password_hash|PasswordHasher|has_secure_password)\b/i,
    msg: "password hashed with a fast digest; use argon2id, scrypt or bcrypt (or PBKDF2 with a high work factor)" },
  { id: "weak-cipher", severity: "high", langs: CODE, ref: "secure-coding S12",
    re: /\bcrypto\.createCipher\s*\(|["'](?:des|des-ede3?|rc4|rc2|bf|blowfish)(?:-[\w-]+)?["']|\bAES\/ECB\b|["']AES["']\s*\)|\bMODE_ECB\b|CipherMode\.ECB|\bDES\.new\s*\(|\bARC4\.new\s*\(|\b(?:TripleDES|DESCryptoServiceProvider|RC2CryptoServiceProvider)\b|\bdes\.NewCipher\b|\brc4\.NewCipher\b|\baes-\d+-ecb\b/i,
    msg: "broken or misused cipher (ECB, DES, RC4, createCipher without IV); use AES-GCM or ChaCha20-Poly1305 from a vetted library" },
  { id: "insecure-random", severity: "high", langs: CODE, ref: "secure-coding S12",
    re: new RegExp("(?:\\bMath\\.random\\s*\\(|\\brandom\\.(?:random|randint|randrange|choice|choices|getrandbits|sample)\\s*\\(|\\bnew\\s+Random\\s*\\(|\\brand\\.(?:Int|Intn|Int63|Read|Uint32)\\w*\\s*\\(|\\b(?:mt_)?rand\\s*\\(|\\buniqid\\s*\\()[^\\n]*" + SECRET_WORD + "|" + SECRET_WORD + "\\w*\\s*[:=][^\\n]*(?:\\bMath\\.random\\s*\\(|\\brandom\\.(?:random|randint|randrange|choice|choices|getrandbits|sample)\\s*\\(|\\bnew\\s+Random\\s*\\(|\\brand\\.(?:Int|Intn|Int63|Read)\\w*\\s*\\(|\\b(?:mt_)?rand\\s*\\(|\\buniqid\\s*\\()", "i"),
    msg: "non-cryptographic RNG for a security value; use crypto.randomBytes/randomUUID, secrets, crypto/rand, SecureRandom or RandomNumberGenerator" },
  { id: "hardcoded-iv-or-salt", severity: "medium", langs: CODE, ref: "secure-coding S12",
    re: /\b(?:iv|nonce|salt)\s*[:=]\s*(?:b?["'][^"'\s]{4,}["']|Buffer\.from\s*\(\s*["']|\[\s*0\s*,\s*0)/i,
    msg: "constant IV, nonce or salt; generate a fresh random value per operation and store it alongside the output" },

  // ---- Authentication, JWT and sessions (secure-coding S11)
  { id: "jwt-none-or-unverified", severity: "critical", langs: CODE, ref: "secure-coding S11",
    re: /algorithms?\s*[:=]\s*\[?\s*["']none["']|["']verify_signature["']\s*:\s*False|\bverify\s*=\s*False[^\n]*\bjwt|\bjwt\.decode\s*\([^)]*verify\s*=\s*False|ignoreExpiration\s*:\s*true|\.parseUnverified\s*\(|ParseUnverified\s*\(|\bverify_exp["']?\s*:\s*False|RequireSignedTokens\s*=\s*false|ValidateIssuerSigningKey\s*=\s*false|ValidateLifetime\s*=\s*false/i,
    msg: "JWT accepted without signature or expiry checks; verify with a pinned algorithm list, key, exp, iss and aud" },
  { id: "jwt-decode-without-verify", severity: "medium", langs: ["js"], ref: "secure-coding S11",
    re: /\bjwt\.decode\s*\(|\bjwtDecode\s*\(|\bjwt_decode\s*\(/,
    msg: "jwt.decode does not verify the signature; use jwt.verify on the server before trusting any claim" },
  { id: "timing-unsafe-compare", severity: "medium", langs: CODE, ref: "secure-coding S11",
    re: new RegExp("\\b\\w*(?:signature|hmac|digest|api_?key|apikey|token|secret)\\w*\\s*(?:===?|!==?)\\s*(?:" + REQ_ANY + "|\\w*(?:provided|given|expected|incoming|header|received|computed)\\w*)", "i"),
    notRe: /\b(?:null|undefined|None|nil)\b|===?\s*["'`]|\.length\b|typeof\b/,
    msg: "secret compared with ==; use a constant-time compare (crypto.timingSafeEqual, hmac.compare_digest, subtle.ConstantTimeCompare)" },
  { id: "cookie-flags-off", severity: "medium", langs: CODE, ref: "secure-coding S14",
    re: /\bhttpOnly\s*:\s*false|\bsecure\s*:\s*false|SESSION_COOKIE_(?:SECURE|HTTPONLY)\s*=\s*False|CSRF_COOKIE_SECURE\s*=\s*False|\.setHttpOnly\s*\(\s*false|\.setSecure\s*\(\s*false|\bsameSite\s*:\s*["']none["'](?![^\n]*secure\s*:\s*true)|HttpOnly\s*=\s*false|Secure\s*=\s*false/i,
    msg: "session/auth cookie without HttpOnly or Secure; set HttpOnly, Secure and SameSite=Lax/Strict outside local dev" },

  // ---- Secrets (secure-coding S13) - run on test files too, output redacted
  { id: "secret-private-key", severity: "critical", langs: null, secret: true, tests: true, ref: "secure-coding S13",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
    msg: "private key in source; move it to a secret manager and rotate it" },
  { id: "secret-cloud-token", severity: "critical", langs: null, secret: true, tests: true, ref: "secure-coding S13",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b|\bgh[osur]_[A-Za-z0-9]{36}\b|\bglpat-[A-Za-z0-9_-]{20}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+|\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bsk-ant-[A-Za-z0-9_-]{20,}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b|\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b|\bnpm_[A-Za-z0-9]{36}\b|\bpypi-[A-Za-z0-9_-]{50,}\b|\bdop_v1_[a-f0-9]{64}\b|\bshpat_[a-fA-F0-9]{32}\b/,
    msg: "credential with a known provider format; remove it, rotate it, and load it from the environment or a secret manager" },
  { id: "secret-connection-string", severity: "high", langs: null, secret: true, tests: true, ref: "secure-coding S13",
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|sqlserver):\/\/[^:\s"'/@]+:([^@\s"'$<{]{3,})@(?!localhost\b|127\.0\.0\.1\b|db\b|postgres\b|mysql\b|redis\b|mongo\b|host\b|example\b)/i,
    notRe: /\b(?:password|pass|changeme|secret|example|xxx+|test|dummy|placeholder)@/i,
    msg: "connection string with an embedded password; read it from the environment or a secret manager" },
  { id: "secret-assignment", severity: "high", langs: null, secret: true, ref: "secure-coding S13",
    re: /\b(?:[A-Za-z_]*(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?key|auth[_-]?token|private[_-]?key|client[_-]?secret|signing[_-]?key|jwt[_-]?secret)[A-Za-z_]*)["']?\s*(?:[:=]|=>|:=)\s*["'][^"'\s]{12,}["']/i,
    notRe: /["'](?:[^"']*(?:\$\{|\{\{|<|%\(|example|sample|changeme|change[_-]?me|placeholder|your[_-]|dummy|redacted|xxxx|\*\*\*|test|fake|mock|not[_-]?a[_-]?secret|replace[_-]?me|todo)[^"']*)["']|process\.env|os\.environ|getenv|ENV\[|Environment\.|config\(|settings\.|\bfrom\b|\brequire\b|\bimport\b|_(?:FIELD|NAME|KEY_NAME|HEADER|PARAM|ENV|VAR|PATH)\b|(?:Field|Name|Header|Param|Label|Path|Url|Regex|Pattern)\s*[:=]/i,
    check: (line) => {
      const m = /(?:[:=]|=>|:=)\s*["']([^"'\s]{12,})["']/.exec(line);
      if (!m) return false;
      const v = m[1];
      if (!/^[\x21-\x7e]+$/.test(v)) return false; // translated UI text, not a key
      if (/[|\\/]|^[\w-]+(?:\.[\w-]+)+$|^[a-z]+(?:[-_][a-z]+)*$|^[A-Z][A-Za-z]+(?:[A-Z][a-z]+)*$/.test(v)) return false; // rules, class paths, dotted keys, plain words
      return /\d/.test(v) || /[^\w]/.test(v) || v.length >= 24;
    },
    msg: "literal value assigned to a secret-named variable; load it from the environment or a secret manager" },

  // ---- Browser-facing config (secure-coding S14)
  { id: "cors-wildcard-credentials", severity: "high", langs: CODE, ref: "secure-coding S14",
    re: /\borigin\s*:\s*(?:true|["']\*["']|\(\s*\w*\s*,\s*(?:cb|callback)\s*\)\s*=>\s*(?:cb|callback)\s*\(\s*null\s*,\s*true)|allow_origins\s*=\s*\[\s*["']\*["']\s*\]|AllowAnyOrigin\s*\(\s*\)|SetIsOriginAllowed\s*\(\s*_?\w*\s*=>\s*true|CORS_ALLOW_ALL_ORIGINS\s*=\s*True|CORS_ORIGIN_ALLOW_ALL\s*=\s*True|AllowOrigins\s*:\s*\[\]string\{\s*"\*"|allowedOrigins\s*\(\s*"\*"|origins\s*=\s*["']\*["']/,
    fileRe: /credentials\s*:\s*true|allow_credentials\s*=\s*True|AllowCredentials\s*(?:\(\s*\)|:\s*true)|CORS_ALLOW_CREDENTIALS\s*=\s*True|allowCredentials\s*\(\s*true|supports_credentials\s*=\s*True/,
    msg: "CORS allows any (or reflected) origin together with credentials; list the allowed origins explicitly" },
  { id: "cors-reflect-origin", severity: "high", langs: CODE, ref: "secure-coding S14",
    re: /(?:Access-Control-Allow-Origin["']?\s*[,:]\s*(?:req|request|r)\.(?:headers?|Header)(?:\.get\s*\(|\[|\.)\s*["']?origin)/i,
    msg: "Access-Control-Allow-Origin reflects the request Origin; check it against an allowlist first" },
  { id: "debug-mode-on", severity: "medium", langs: CODE, ref: "secure-coding S17",
    re: /\.run\s*\([^)]*\bdebug\s*=\s*True|^\s*DEBUG\s*=\s*True\b|app\.debug\s*=\s*True|UseDeveloperExceptionPage\s*\(\s*\)(?![^\n]*IsDevelopment)|\bdisplay_errors\s*[=,]\s*["']?(?:1|on|true)/i,
    msg: "debug mode or developer error pages enabled; gate them on a development-only setting" },
  { id: "csrf-disabled", severity: "medium", langs: CODE, ref: "secure-coding S14",
    re: /\.csrf\s*\(\s*\)\s*\.disable\s*\(|csrf\s*\(\s*(?:\w+\s*->\s*\w+\.disable|AbstractHttpConfigurer::disable)|@csrf_exempt|WTF_CSRF_ENABLED\s*=\s*False|skip_forgery_protection|protect_from_forgery\s+with:\s*:null_session|IgnoreAntiforgeryToken/,
    msg: "CSRF protection disabled; keep it on for cookie-authenticated endpoints (token APIs without cookies are fine: justify it)" },

  // ---- Request handling: mass assignment, SSRF, paths, redirects, XSS (S2, S5, S6, S9)
  { id: "mass-assignment", severity: "high", langs: CODE, ref: "secure-coding S2",
    re: new RegExp("\\.(?:create|update|updateOne|updateMany|findByIdAndUpdate|findOneAndUpdate|insert|insertOne|upsert|save|build|merge|set|assign|update_attributes|fill|forceFill)\\s*\\(\\s*(?:\\{\\s*(?:data\\s*:\\s*)?)?(?:\\.\\.\\.\\s*)?(?:" + REQ_JS + "|" + REQ_PY + "|\\$request->all\\(\\)|params(?!\\.(?:require|permit)))\\s*\\}?\\s*[,)]|\\bdata\\s*:\\s*(?:" + REQ_JS + "|" + REQ_PY + ")\\s*[,}]|Object\\.assign\\s*\\(\\s*\\w+\\s*,\\s*" + REQ_JS + "|\\.\\.\\.\\s*" + REQ_JS + "\\b(?!\\.)|\\(\\s*\\*\\*\\s*" + REQ_PY + "|\\.permit!|\\$guarded\\s*=\\s*\\[\\s*\\]|\\*\\*\\s*\\w+\\.(?:dict|model_dump)\\s*\\(\\s*\\)\\s*\\)"),
    msg: "request body bound straight onto a model (mass assignment); copy allowlisted fields into a DTO" },
  { id: "ssrf-request-url", severity: "high", langs: CODE, ref: "secure-coding S6",
    re: new RegExp("(?:\\bfetch|\\baxios(?:\\.(?:get|post|put|delete|request|head))?|\\bgot(?:\\.(?:get|post))?|\\bneedle|\\bsuperagent\\.(?:get|post)|\\bhttps?\\.(?:get|request)|\\brequests\\.(?:get|post|put|delete|head|request)|\\bhttpx\\.(?:get|post|request)|\\burllib\\.request\\.urlopen|\\burlopen|\\bhttp\\.(?:Get|Post|Head|NewRequest(?:WithContext)?)|\\bRestTemplate\\.\\w+|\\bWebClient\\.\\w+|\\bGetAsync|\\bfile_get_contents|\\bcurl_init|\\bNet::HTTP\\.get|\\bURI\\.open|\\bopen-uri)\\s*\\((?:\\s*ctx\\s*,)?(?:\\s*[\"'](?:GET|POST)[\"']\\s*,)?\\s*(?:`[^`]*\\$\\{\\s*)?(?:" + REQ_ANY + ")"),
    msg: "outbound request to a URL from the request (SSRF); allowlist hosts and block private, loopback and metadata addresses after DNS resolution" },
  { id: "path-traversal", severity: "high", langs: CODE, ref: "secure-coding S5",
    re: new RegExp("(?:\\breadFile(?:Sync)?|\\bcreateReadStream|\\bwriteFile(?:Sync)?|\\bcreateWriteStream|\\bunlink(?:Sync)?|\\bsendFile|\\bres\\.download|\\bpath\\.(?:join|resolve)|\\bopen|\\bos\\.path\\.join|\\bsend_file|\\bsend_from_directory|\\bFileResponse|\\bPath|\\bos\\.(?:Open|ReadFile|Create|Remove)|\\bfilepath\\.Join|\\bnew\\s+File|\\bPaths\\.get|\\bFile\\.(?:ReadAllText|ReadAllBytes|OpenRead|Delete)|\\bfopen|\\bfile_get_contents|\\binclude|\\brequire(?:_once)?|\\bFile\\.(?:read|open))\\s*\\((?:[^()]*,\\s*)?\\s*(?:`[^`]*\\$\\{\\s*)?(?:" + REQ_ANY + ")"),
    msg: "file path built from request data (path traversal); resolve it, then check it stays inside the allowed base folder" },
  { id: "zip-slip", severity: "high", langs: CODE, ref: "secure-coding S5",
    re: /\.extractall\s*\((?![^)]*filter\s*=)|\bZipFile\.ExtractToDirectory\s*\(|\bAdmZip\b[^\n]*extractAllTo|\.extractAllTo\s*\(/,
    msg: "archive extracted without checking entry paths (zip slip); validate each entry stays inside the target (Python 3.12+: filter='data')" },
  { id: "open-redirect", severity: "medium", langs: CODE, ref: "secure-coding S9",
    re: new RegExp("\\b(?:res\\.redirect|redirect|RedirectResponse|HttpResponseRedirect|Redirect|http\\.Redirect|redirect_to|header\\s*\\(\\s*[\"']Location:)\\s*\\((?:[^()]*,\\s*)?\\s*(?:`[^`]*\\$\\{\\s*)?(?:" + REQ_ANY + ")|header\\s*\\(\\s*[\"']Location:\\s*[\"']\\s*\\.\\s*\\$_(?:GET|POST|REQUEST)"),
    msg: "redirect target taken from the request (open redirect); allow only relative paths or allowlisted hosts" },
  { id: "xss-sink", severity: "medium", langs: CODE, ref: "secure-coding S9",
    re: new RegExp("\\.innerHTML\\s*=|\\.outerHTML\\s*=|dangerouslySetInnerHTML|document\\.write\\s*\\(|\\bv-html\\b|\\|\\s*safe\\b|\\bmark_safe\\s*\\(|\\bMarkup\\s*\\(|\\.html_safe\\b|\\braw\\s*\\(\\s*@|\\bHtml\\.Raw\\s*\\(|autoescape\\s*[=:]\\s*(?:False|false)|\\{\\{\\{|<%-|\\btemplate\\.HTML\\s*\\(|\\bres\\.(?:send|write|end)\\s*\\(\\s*(?:`[^`]*\\$\\{\\s*)?" + REQ_JS + "|\\becho\\s+\\$_(?:GET|POST|REQUEST)"),
    notRe: /\.(?:inner|outer)HTML\s*=\s*(["'])[^"'+`]*\1\s*;?\s*$|JSON\.stringify\([^)]*\)\.replace\(\s*\/</,
    msg: "unescaped HTML output; encode by context or sanitize with a vetted library (DOMPurify, bleach/nh3)" },
  { id: "header-injection", severity: "medium", langs: CODE, ref: "secure-coding S9",
    re: new RegExp("\\b(?:res\\.(?:setHeader|set|header|append)|response\\.headers\\[|\\.Header\\(\\)\\.(?:Set|Add)|addHeader|setHeader|AppendHeader)\\s*\\(?\\s*[^,\\n]+,\\s*(?:" + REQ_ANY + ")"),
    msg: "response header value taken from the request; reject CR/LF and validate the value" },
  { id: "regex-from-input", severity: "high", langs: CODE, ref: "secure-coding S10",
    re: new RegExp("(?:\\bnew\\s+RegExp|\\bRegExp|\\bre\\.(?:compile|match|search|fullmatch|sub|findall)|\\bregexp\\.(?:Compile|MustCompile|MatchString)|\\bPattern\\.compile|\\bnew\\s+Regex|\\bRegex\\.(?:IsMatch|Match)|\\bpreg_match)\\s*\\(\\s*(?:" + REQ_ANY + ")"),
    msg: "regular expression built from request data (ReDoS, injection); escape it as a literal or use a linear-time engine (RE2) with a length cap" },
  { id: "prototype-pollution", severity: "high", langs: ["js"], ref: "secure-coding S10",
    re: new RegExp("\\b(?:_|lodash)\\.(?:merge|mergeWith|defaultsDeep|set|setWith|zipObjectDeep)\\s*\\([^)]*" + REQ_JS + "|\\$\\.extend\\s*\\(\\s*true|\\b(?:deepmerge|merge|deepMerge|extend|assignDeep)\\s*\\(\\s*\\w+\\s*,\\s*" + REQ_JS),
    msg: "deep merge of request data (prototype pollution); validate with a schema and reject __proto__, constructor and prototype keys" },
  { id: "error-detail-leak", severity: "medium", langs: CODE, ref: "secure-coding S17",
    re: /\bres\.(?:status\s*\(\s*\d+\s*\)\s*\.)?(?:json|send)\s*\([^)]*\b(?:err|error|e|ex)\.(?:stack|message)\b|traceback\.format_exc\s*\(\s*\)[^\n]*(?:return|Response|jsonify)|(?:return|Response|jsonify)[^\n]*traceback\.format_exc|\bex(?:ception)?\.(?:StackTrace|ToString\s*\(\s*\))[^\n]*(?:Ok|BadRequest|Problem|Content|StatusCode)\s*\(|e\.printStackTrace\s*\(\s*\)/,
    msg: "internal error detail returned to the client; log it server-side and return a generic error with a correlation id" },
  { id: "secret-in-log", severity: "medium", langs: CODE, ref: "secure-coding S17",
    re: /\b(?:console\.(?:log|info|warn|error|debug)|logger\.\w+|log\.(?:Print\w*|Info\w*|Debug\w*|Warn\w*|Error\w*|info|debug|warn|error)|logging\.\w+|print|println|fmt\.Print\w*|System\.out\.print\w*|Log\.\w+|_logger\.\w+|Rails\.logger\.\w+|error_log)\s*\([^\n]*\b(?:password|passwd|secret|api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|private[_-]?key|card[_-]?number|cvv|ssn)\b(?!\s*(?:[:=]\s*["'][^"']*["']\s*\)|_?(?:length|len|hash|id|policy|reset|field|changed|expir\w*|valid\w*|missing|required|rules?)\b))/i,
    notRe: /\b(?:invalid|incorrect|wrong|missing|failed|expired|required|reset (?:link|email)|mismatch|rotate|rotated|redact)/i,
    check: (line) => /\b(?:password|passwd|secret|api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|private[_-]?key|card[_-]?number|cvv|ssn)\b/i.test(
      line.replace(/`(?:[^`\\]|\\.)*`/g, (t) => (t.match(/\$\{[^}]*\}/g) || []).join(" ")).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')),
    msg: "possible secret or card data in a log line; log an id or a redacted value instead" },

  // ---- Supply chain: Docker and CI (secure-coding S18)
  { id: "pipe-to-shell", severity: "high", langs: ["docker", "shell", "yaml"], ref: "secure-coding S18",
    re: /\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b|\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:python3?|node|perl|ruby)\b|\biex\s*\(\s*(?:New-Object\s+Net\.WebClient|iwr|Invoke-WebRequest)/i,
    msg: "remote script piped into an interpreter; download a pinned version, verify its checksum, then run it" },
  { id: "gha-script-injection", severity: "high", langs: ["yaml"], ref: "secure-coding S18",
    re: /\$\{\{\s*github\.(?:event\.(?:issue\.(?:title|body)|pull_request\.(?:title|body|head\.ref|head\.label)|comment\.body|review\.body|review_comment\.body|head_commit\.(?:message|author\.(?:email|name))|commits\[|pages\[)|head_ref)\b/,
    fileRe: /^\s*(?:-\s*)?run\s*:/m,
    msg: "attacker-controlled GitHub context interpolated into a workflow; pass it through env: and quote the variable" },
  { id: "gha-pull-request-target", severity: "medium", langs: ["yaml"], ref: "secure-coding S18",
    re: /^\s*(?:-\s*)?pull_request_target\s*:?\s*$|on\s*:\s*\[?[^\n]*\bpull_request_target\b/m,
    fileRe: /actions\/checkout/,
    msg: "pull_request_target with checkout runs untrusted code with secrets; never check out the PR head in this trigger" },
  { id: "gha-unpinned-action", severity: "low", langs: ["yaml"], ref: "secure-coding S18",
    re: /^\s*(?:-\s*)?uses\s*:\s*(?!\.\/|docker:\/\/)[\w.-]+\/[\w./-]+@(?![0-9a-f]{40}\b)\S+/,
    fileRe: /^\s*(?:jobs|runs)\s*:/m,
    msg: "third-party action pinned to a tag or branch; pin it to a full commit SHA" },
  { id: "docker-latest-or-root", severity: "low", langs: ["docker"], ref: "secure-coding S18",
    re: /^\s*FROM\s+(?:--platform=\S+\s+)?[^\s:@]+(?::latest)?(?:\s+AS\s+\w+)?\s*$|^\s*USER\s+(?:root|0)\s*$/i,
    notRe: /^\s*FROM\s+(?:scratch|[\w-]+)(?:\s+AS\s+\w+)?\s*$/i,
    msg: "base image not pinned (or container runs as root); pin a version or digest and add a non-root USER" },
];

const RULE_IDS = new Set(RULES.map((r) => r.id));
const SUPPRESS_RE = /security-scan:\s*ignore\s+([\w-]+)(?:\s+(.*))?/;
const IGNORE_FILE_RE = /security-scan:\s*ignore-file\s+(\S.{9,})/;

// Returns the reason when the file opts out with a valid ignore-file marker.
function ignoreFileReason(text) {
  const head = String(text).split(/\r?\n/, 20).join("\n");
  const m = IGNORE_FILE_RE.exec(head);
  return m ? m[1].trim() : null;
}

function redact(line) {
  return line.replace(/(["'`]?)([^"'`\s=:]{4})[^"'`\s]{4,}/g, (m, q, head) => `${q}${head}****`).slice(0, 160);
}

function stripCommentOnly(line, lang) {
  const t = line.trim();
  if (!t) return true;
  if (lang === "yaml" || lang === "shell" || lang === "docker" || lang === "config" || lang === "py" || lang === "rb") {
    if (t.startsWith("#")) return true;
  }
  if (CODE.includes(lang) && lang !== "py" && lang !== "rb" && (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"))) return true;
  return false;
}

function scanText(text, file, opts = {}) {
  const lang = opts.lang || langOf(file || "");
  if (!lang) return [];
  const testFile = opts.includeTests ? false : isTestFile(file || "");
  const lines = String(text).split(/\r?\n/);
  const findings = [];
  const fileChecks = new Map();
  const fileOk = (rule) => {
    if (!rule.fileRe) return true;
    if (!fileChecks.has(rule.id)) fileChecks.set(rule.id, rule.fileRe.test(text));
    return fileChecks.get(rule.id);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 4000) continue; // minified or generated
    const prev = i > 0 ? lines[i - 1] : "";
    const sup = SUPPRESS_RE.exec(line) || SUPPRESS_RE.exec(prev);
    const suppressedId = sup && sup[2] && sup[2].trim().length >= 10 && RULE_IDS.has(sup[1]) ? sup[1] : null;
    if (sup && SUPPRESS_RE.exec(line) && (!sup[2] || sup[2].trim().length < 10 || !RULE_IDS.has(sup[1]))) {
      findings.push({ rule: "invalid-suppression", severity: "medium", file, line: i + 1, ref: "security-scan",
        message: `suppression needs a known rule id and a reason of at least 10 characters (got "${sup[1]}")`, snippet: line.trim().slice(0, 160) });
    }
    const commentOnly = stripCommentOnly(line, lang);
    for (const rule of RULES) {
      if (rule.langs && !rule.langs.includes(lang)) continue;
      if (testFile && !rule.tests) continue;
      if (commentOnly && !rule.secret) continue;
      if (!rule.re.test(line)) continue;
      if (rule.notRe && rule.notRe.test(line)) continue;
      if (rule.check && !rule.check(line, lang)) continue;
      if (!fileOk(rule)) continue;
      if (suppressedId === rule.id) continue;
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        file,
        line: i + 1,
        ref: rule.ref,
        message: rule.msg,
        snippet: rule.secret ? redact(line.trim()) : line.trim().slice(0, 160),
      });
    }
  }
  return findings;
}

function walk(target, out) {
  let st;
  try {
    st = fs.statSync(target);
  } catch {
    return out;
  }
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(target)) {
      if (SKIP_DIRS.has(name)) continue;
      walk(path.join(target, name), out);
    }
  } else if (st.isFile() && st.size <= MAX_FILE_BYTES && langOf(target)) {
    out.push(target);
  }
  return out;
}

function changedFiles(base) {
  const run = (args) => {
    const r = spawnSync("git", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || "").trim()}`);
    return r.stdout.split(/\r?\n/).filter(Boolean);
  };
  const files = new Set([
    ...run(["diff", "--name-only", "--diff-filter=ACMR", base]),
    ...run(["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...files].filter((f) => fs.existsSync(f) && langOf(f));
}

function scanFiles(files, opts = {}) {
  const findings = [];
  const skipped = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue; // binary
    const rel = file.replace(/\\/g, "/");
    if (!opts.includeVendored && isVendored(rel, text)) {
      if (opts.vendored) opts.vendored.push(rel);
      continue;
    }
    const reason = ignoreFileReason(text);
    if (reason) {
      skipped.push({ file: rel, reason });
      continue;
    }
    findings.push(...scanText(text, rel, opts));
  }
  if (opts.skipped) opts.skipped.push(...skipped);
  return findings;
}

function parseArgs(argv) {
  const opts = { paths: [], json: false, failOn: "high", includeTests: false, changed: false, base: "HEAD" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--include-tests") opts.includeTests = true;
    else if (a === "--include-vendored") opts.includeVendored = true;
    else if (a === "--changed") opts.changed = true;
    else if (a === "--base") opts.base = argv[++i];
    else if (a === "--fail-on") opts.failOn = argv[++i];
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
    else opts.paths.push(a);
  }
  if (!SEVERITIES.includes(opts.failOn)) throw new Error(`--fail-on must be one of ${SEVERITIES.join(", ")}`);
  if (opts.changed && opts.paths.length) throw new Error("use either --changed or paths, not both");
  if (!opts.base) throw new Error("--base needs a git ref");
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(`security-scan: ${e.message}`);
    return 2;
  }
  if (opts.help) {
    console.log("usage: node security-scan.js [paths...] | --changed [--base ref]  [--json] [--fail-on critical|high|medium|low] [--include-tests]");
    return 0;
  }
  let files;
  try {
    files = opts.changed ? changedFiles(opts.base) : (opts.paths.length ? opts.paths : ["."]).flatMap((p) => walk(p, []));
  } catch (e) {
    console.error(`security-scan: ${e.message}`);
    return 2;
  }
  opts.skipped = [];
  opts.vendored = [];
  const findings = scanFiles(files, opts).sort((a, b) => rank(b.severity) - rank(a.severity) || a.file.localeCompare(b.file) || a.line - b.line);
  const failing = findings.filter((f) => rank(f.severity) >= rank(opts.failOn));

  if (opts.json) {
    console.log(JSON.stringify({ files: files.length, findings, skipped: opts.skipped, vendored: opts.vendored.length, failOn: opts.failOn, failed: failing.length > 0 }, null, 2));
  } else {
    for (const s of opts.skipped) console.log(`SKIPPED  ${s.file}  (ignore-file: ${s.reason})`);
    for (const f of findings) {
      console.log(`${f.severity.toUpperCase().padEnd(8)} ${f.file}:${f.line}  [${f.rule}] ${f.message} (${f.ref})`);
      console.log(`         ${f.snippet}`);
    }
    const counts = SEVERITIES.slice().reverse().map((s) => `${findings.filter((f) => f.severity === s).length} ${s}`).join(", ");
    const vend = opts.vendored.length ? `, ${opts.vendored.length} vendored/generated file(s) skipped` : "";
    console.log(`security-scan: ${files.length} file(s)${vend}, ${findings.length} finding(s) (${counts}); failing at >= ${opts.failOn}: ${failing.length}`);
  }
  return failing.length > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { RULES, SEVERITIES, scanText, scanFiles, ignoreFileReason, isVendored, langOf, isTestFile, redact, main };
