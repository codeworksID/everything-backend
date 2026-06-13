---
name: backend-orchestrator
description: "Master orchestrator that auto-routes user requests to the appropriate backend sub-skill. Detects user intent (discovery, architecture, database, API, implementation, doctor, refresh-memory) and loads the right skill. Use this skill when the user asks for backend help without specifying which skill, or says 'build backend', 'help with backend', 'create API'."
---

# Backend Orchestrator

## When to Activate

- User asks for backend help without specifying which skill
- User says "build backend", "help with backend", "create API", "start backend"
- User's intent is ambiguous and needs routing
- Multiple sub-skills may be needed for a complex request
- First contact with the backend skill system

## Orchestration Process

### Step 1: Intent Detection

Analyze the user's message to detect intent:

#### Discovery Intent
- **Keywords**: "explore", "understand", "what's here", "analyze", "existing project"
- **Examples**: "Explore my project", "What backend do I have?", "Analyze this codebase"
- **Action**: Load `backend-discovery` skill

#### Architecture Intent
- **Keywords**: "design", "architecture", "structure", "plan", "how to build"
- **Examples**: "Design my backend", "Plan the architecture", "How should I structure this?"
- **Action**: Load `backend-architect` skill

#### Database Intent
- **Keywords**: "database", "schema", "tables", "collections", "migrations", "model"
- **Examples**: "Design database", "Create schema", "Plan tables", "What database?"
- **Action**: Load `backend-db-design` skill

#### API Intent
- **Keywords**: "API", "endpoints", "routes", "REST", "GraphQL", "gRPC"
- **Examples**: "Design API", "Create endpoints", "Plan routes", "What endpoints?"
- **Action**: Load `backend-api-design` skill

#### Implementation Intent
- **Keywords**: "implement", "generate", "code", "build", "scaffold", "create the code"
- **Examples**: "Generate code", "Implement this", "Build the backend", "Scaffold project"
- **Action**: Load `backend-implement` skill

#### Health Check Intent
- **Keywords**: "check", "health", "review", "doctor", "audit", "secure"
- **Examples**: "Check my backend", "Health check", "Review code", "Is it secure?"
- **Action**: Load `backend-doctor` skill

#### Memory Intent
- **Keywords**: "refresh", "update memory", "sync", "remember"
- **Examples**: "Refresh memory", "Update memory", "Sync memory"
- **Action**: Load `backend-refresh-memory` skill

### Step 2: Context Loading

Before routing, load context:

- Read `.opencode/everything-backend-memory/project-overview.md` (if exists)
- Determine if project is new or existing
- Check which skills have been used previously
- Identify project state

### Step 3: Skill Routing

#### Single Skill Request
If user wants one specific thing:
1. Identify the matching skill
2. Load that skill
3. Pass user message and context
4. Let skill handle the request

#### Multiple Skill Request
If user wants multiple things:
1. Break down into sub-tasks
2. Identify skill for each sub-task
3. Execute in logical order (e.g., architect → db-design → api-design → implement)
4. Coordinate between skills

#### Complex Request
If request is vague or complex:
1. Ask user for clarification
2. Break down into smaller tasks
3. Confirm understanding before proceeding

### Step 4: Skill Execution

Load the identified skill using the `skill` tool:

```typescript
skill(name="backend-discovery", user_message="Explore my project")
skill(name="backend-architect", user_message="Design my backend")
skill(name="backend-db-design", user_message="Design database schema")
skill(name="backend-api-design", user_message="Design API endpoints")
skill(name="backend-implement", user_message="Generate code")
skill(name="backend-doctor", user_message="Check my backend")
skill(name="backend-refresh-memory", user_message="Update memory")
```

### Step 5: User Confirmation

Before loading any skill, present your routing decision:

```markdown
# Skill Selection

Based on your request: "[user message]"

I recommend loading: **backend-[skill-name]**

**Purpose**: [What this skill does]
**Why**: [Why this skill matches your request]

Shall I proceed?
```

Ask:
- "Is this the right skill for your needs?"
- "Should I proceed with this approach?"
- "Would you like a different skill instead?"

**ALWAYS** get user confirmation before loading a skill.

## Decision Trees

### If user says "build a backend":
1. Ask: "Is this a new project or existing project?"
2. If new → Load `backend-architect` first
3. If existing → Load `backend-discovery` first
4. Then suggest next steps based on context

### If user says "create user authentication":
1. Check if architecture exists in memory
2. If not → Load `backend-architect` first
3. If yes → Load `backend-api-design` for auth endpoints
4. Then → Load `backend-implement` for code

### If user says "check my code":
1. Check if code exists
2. If not → Load `backend-discovery` first
3. If yes → Load `backend-doctor`

### If user says "design database":
1. Check if architecture exists
2. If not → Load `backend-architect` first
3. If yes → Load `backend-db-design`

### If user says "design API":
1. Check if architecture and schema exist
2. If not → Load `backend-architect` and `backend-db-design` first
3. If yes → Load `backend-api-design`

### If user says "implement" or "generate code":
1. Check if design exists (architecture, API, DB)
2. If not → Suggest running design skills first
3. If yes → Load `backend-implement`

### If multiple intents detected:
1. Present all detected intents
2. Ask user to prioritize
3. Load skills in logical order

## Routing Examples

### Example 1: New Project
```
User: "I want to build a REST API for a todo app"
Orchestrator: "I'll help you design the architecture first."
→ Load backend-architect
```

### Example 2: Existing Project
```
User: "Explore my existing Node.js project"
Orchestrator: "I'll explore your project structure."
→ Load backend-discovery
```

### Example 3: Specific Feature
```
User: "Add user authentication to my API"
Orchestrator: "I'll design the authentication API endpoints."
→ Load backend-api-design
```

### Example 4: Health Check
```
User: "Check my backend for issues"
Orchestrator: "I'll run a health check on your backend."
→ Load backend-doctor
```

### Example 5: Complex Request
```
User: "Build a complete e-commerce backend"
Orchestrator: "This is a complex request. Let me break it down:
  1. Design architecture (backend-architect)
  2. Design database (backend-db-design)
  3. Design API (backend-api-design)
  4. Generate code (backend-implement)
  
  Should I start with architecture design?"
```

## Templates

### Welcome Message Template
```markdown
# Backend Orchestrator

I can help you with:
- 🔍 **Discovery** (`backend-discovery`): Explore existing project
- 🏗️ **Architecture** (`backend-architect`): Design backend structure
- 🗄️ **Database** (`backend-db-design`): Design database schema
- 🔌 **API** (`backend-api-design`): Design API endpoints
- ⚙️ **Implementation** (`backend-implement`): Generate code
- 🏥 **Doctor** (`backend-doctor`): Health check
- 🔄 **Refresh** (`backend-refresh-memory`): Update memory

What would you like to do?
```

### Skill Selection Template
```markdown
# Skill Routing

**Your request**: "[user message]"

**Detected intent**: [intent type]

**Recommended skill**: `backend-[skill-name]`
**Purpose**: [What this skill does]
**Next steps**: [What will happen]

Should I proceed with this skill?
```

### Multi-Skill Plan Template
```markdown
# Multi-Skill Plan

Your request requires multiple skills. Here's the plan:

1. **backend-architect** - [Reason]
2. **backend-db-design** - [Reason]
3. **backend-api-design** - [Reason]
4. **backend-implement** - [Reason]

Estimated time: [rough estimate]

Should I start with step 1?
```

## Sub-Skills Reference

This orchestrator can load the following sub-skills:

- `backend-discovery` - Project exploration and memory creation
- `backend-architect` - High-level architecture planning
- `backend-db-design` - Database schema design
- `backend-api-design` - API endpoint design
- `backend-implement` - Code generation
- `backend-doctor` - Health check and recommendations
- `backend-refresh-memory` - Memory update from project state

## Edge Cases

- **Ambiguous request**: Ask user to clarify what they want
- **Multiple intents detected**: Present all, ask user to prioritize
- **No clear skill match**: Ask user to choose from available skills
- **Skill load failure**: Suggest alternative approach or manual steps
- **Empty memory**: Suggest running `backend-discovery` first to get context
- **Existing project memory**: Use memory to inform routing decisions
