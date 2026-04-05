# 🚀 Fairlx - Enterprise-Grade Agile Project Management Platform

<div align="center">

<img src="public/Logo.png" alt="Fairlx Logo" width="120" height="120" />

**Production-Ready Agile Management for Modern Teams**

[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js%2015-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Appwrite](https://img.shields.io/badge/Appwrite-FD366E?style=flat&logo=appwrite&logoColor=white)](https://appwrite.io/)

*Enterprise project management with organizations, workspaces, spaces, custom workflows, AI assistance, usage-based billing, and GitHub integration.*

[📖 Documentation](#-documentation) | [🚀 Quick Start](#-quick-start-guide) | [💡 Contributing](CONTRIBUTING.md) | [🏗️ Architecture](#-architecture--data-flow)

</div>

---


## 📚 Table of Contents

- [Overview](#-overview)
- [Documentation](#-documentation)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)  
- [Quick Start Guide](#-quick-start-guide)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Project Structure](#-project-structure)
- [Environment Configuration](#-environment-configuration)
- [Feature Modules](#-feature-modules)
- [Permission & RBAC System](#-permission--rbac-system)
- [Billing & Usage Tracking](#-billing--usage-tracking)
- [AI Features](#-ai-features)
- [Development Workflow](#-development-workflow)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [Security](#-security)

---

## 🎯 Overview

Fairlx is a **production-ready enterprise project management platform** built with Next.js 15, TypeScript, and Appwrite. It combines modern agile methodologies with powerful features for teams of any size.

### What Makes Fairlx Different?

- **Dual Account System**: Personal accounts for solo developers; Organization accounts with shared billing and multi-user management
- **Hierarchical Organization**: Organiz ations → Workspaces → Spaces → Projects → Tasks (flexible 5-level structure)
- **Custom Workflows + AI**: Build custom status flows and transitions with AI-powered suggestions and validation
- **Production Billing**: Usage-based metering (traffic, storage, compute) with Razorpay integration, grace periods, and automated suspension
- **Enterprise RBAC**: Multi-level role-based access control with granular permissions at org, workspace, space, project, and team levels
- **AI-First Features**: Google Gemini integration for workflow assistance, code analysis, documentation generation
- **GitHub Native**: Repository linking with automatic documentation generation and commit synchronization

### Core Capabilities

| Capability | Implementation |
|------------|----------------|
| **Account Types** | Personal (individual use) and Organization (team collaboration with shared billing) |
| **Organization** | Multi-tenant with departments, audit logs, role hierarchy (Owner/Admin/Moderator/Member) |
| **Workspaces** | Multiple workspaces per account with Simple/Advanced UI modes and feature toggles |
| **Spaces** | Logical containers (departments, products, clients) with unique keys for work item prefixing |
| **Projects** | Scrum/Kanban/Hybrid boards with WIP limits, sprint management, GitHub integration |
| **Work Items** | Tasks, Stories, Bugs, Epics with custom fields, labels, assignments, dependencies |
| **Workflows** | Custom statuses and transitions with team-based rules and AI assistance |
| **Time Tracking** | Estimates vs actuals, timesheets, variance analysis, capacity planning |
| **Billing** | Usage metering, invoicing, Razorpay e-mandate, grace periods, account suspension |
| **AI Integration** | Workflow suggestions, code Q&A, documentation generation via Gemini API |

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Complete setup, architecture, and feature reference (this file) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development guidelines, branching strategy, PR workflow |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community standards and enforcement policies |
| [changelog.md](changelog.md) | Detailed version history and implementation updates |
| [DATABASE_UPDATES.md](DATABASE_UPDATES.md) | Schema changes, migrations, and workflow redesign notes |
| [PROGRAMS_IMPLEMENTATION_GUIDE.md](PROGRAMS_IMPLEMENTATION_GUIDE.md) | Complete guide to Programs feature architecture |
| [md/APPWRITE_SETUP.md](md/APPWRITE_SETUP.md) | Step-by-step Appwrite database configuration |
| [md/APPWRITE_GUIDE.md](md/APPWRITE_GUIDE.md) | Complete collection schemas, attributes, and indexes |
| [md/MIGRATION_SETUP.md](md/MIGRATION_SETUP.md) | Migration scripts for project RBAC and teams |
| [docs/FEATURES_COMPLETE.md](docs/FEATURES_COMPLETE.md) | Implementation summary with performance improvements |
| [docs/SPACES_GUIDE.md](docs/SPACES_GUIDE.md) | Visual guide to Spaces feature with use cases |
| [docs/SPACES_TESTING_GUIDE.md](docs/SPACES_TESTING_GUIDE.md) | Testing procedures for Spaces functionality |
| [docs/APPWRITE_ORGANIZATIONS_SETUP.md](docs/APPWRITE_ORGANIZATIONS_SETUP.md) | Organization-level Appwrite configuration |
| [src/features/billing/VALIDATION_CHECKLIST.md](src/features/billing/VALIDATION_CHECKLIST.md) | Pre-production billing system validation |

---

## ✨ Key Features

### 🏢 Organization & Workspace Management

- **Personal Accounts**: For individual developers and freelancers
- **Organization Accounts**: Team collaboration with shared billing and member management
- **Multi-Workspace**: Create unlimited workspaces per account
- **UI Modes**: Simple mode (small teams) or Advanced mode (enterprise features)
- **Feature Toggles**: Enable/disable Spaces, Programs, Teams, Advanced Permissions per workspace
- **Departments**: Organize organization members into departments with permissions

### 📋 Work Management

- **Work Items**: Tasks, Stories, Bugs, Epics, Ideas, Improvements with rich metadata
- **Subtasks**: Hierarchical task breakdown with progress tracking
- **Custom Fields**: Text, number, date, select, multi-select, user, checkbox, URL, currency, percentage, labels
- **Work Item Links**: Blocks, relates-to, duplicates, split-from, cloned-from, parent/child, causes relationships
- **Personal Backlog**: Individual work queues independent of projects
- **Saved Views**: Custom filters and sorting for Kanban, List, Calendar, Timeline views

### 🏃 Sprint & Board Management

- **Board Types**: Scrum, Kanban, or Hybrid workflows
- **Sprint States**: Planned, Active, Completed, Cancelled with velocity tracking
- **WIP Limits**: Configure work-in-progress limits per column
- **Burndown Charts**: Sprint progress visualization
- **Velocity Tracking**: Team capacity and historical velocity analysis
- **Custom Columns**: Configurable kanban columns with icons and colors

### 🔄 Workflows & Customization

- **Custom Workflows**: Define status flows per workspace, space, or project
- **Status Types**: Open, In Progress, Closed for analytics
- **Transitions**: Controlled state changes with conditions
- **Team-Based Rules**: Restrict transitions by team or role
- **Approval Workflows**: Require approvals for specific transitions
- **Auto-Transitions**: Automatic state changes based on conditions
- **AI Assistant**: Generate workflows, suggest statuses/transitions, identify issues

### ⏱️ Time Tracking & Planning

- **Time Logs**: Track actual time spent on tasks
- **Estimates**: Story points and time estimates
- **Variance Analysis**: Compare estimates vs actuals
- **Timesheets**: Export time logs for reporting
- **Capacity Planning**: Team capacity vs workload analysis
- **Timeline View**: Gantt-style project timelines with epic grouping

### 👥 Team & Permission Management

- **Project Teams**: Teams scoped to specific projects
- **Team Roles**: Lead, Member, Custom roles with granular permissions
- **Project Members**: Project-specific membership and roles
- **Custom Roles**: Define custom role permissions per project
- **Organization Roles**: Owner, Admin, Moderator, Member hierarchy
- **Workspace Roles**: Admin, Editor, Viewer permissions
- **Space Roles**: Admin/Master, Member, Viewer access levels

### 📎 Collaboration & Documentation

- **Comments**: Threaded conversations with @mentions
- **Attachments**: File uploads (20MB limit) with preview support
- **Project Documents**: PRDs, FRDs, Technical Specs, API Docs (5GB storage)
- **AI Documentation**: Auto-generate documentation from project context
- **Notifications**: Real-time updates for assignments, status changes, comments
- **Audit Logs**: Organization-level activity tracking

### 🐙 GitHub Integration

- **Repository Linking**: Connect GitHub repos to projects
- **Commit Sync**: Track commits and link to work items
- **AI Code Documentation**: Auto-generate code documentation from repositories
- **Code Q&A**: Ask questions about codebase with AI assistance
- **File References**: Deep linking to specific files and lines

### 💳 Billing & Usage Tracking

- **Usage Metering**: Track traffic (GB), storage (GB/month), compute units
- **Automated Billing**: Monthly billing cycles with Razorpay integration
- **E-Mandate**: Automatic payment collection via Razorpay e-mandate
- **Grace Periods**: 14-day grace period before account suspension
- **Account Suspension**: Automatic suspension for non-payment
- **Invoicing**: Generated invoices with detailed usage breakdown
- **Wallet System**: Prepaid wallet for billing (optional)
- **Multi-Currency**: Support for different currencies

### 🤖 AI-Powered Features

- **Workflow AI**: Analyze workflows, suggest improvements, generate templates
- **Code Analysis**: Ask questions about linked GitHub repositories
- **Documentation Generation**: Auto-create PRDs, technical specs, API docs
- **Duplicate Detection**: Identify potentially duplicate work items
- **Risk Prediction**: Proactive alerts for scope creep and deadline risks
- **Sprint Planning**: AI recommendations for capacity and prioritization

### 🛡️ Security & Compliance

- **Email Verification**: Required for account access
- **OAuth Support**: Google and GitHub authentication
- **Password Management**: Reset, change password functionality
- **Session Management**: Secure session handling with Appwrite
- **Server-Side Validation**: Never trust client-provided organization IDs
- **Billing Enforcement**: Middleware blocks writes for suspended accounts
- **Webhook Verification**: Razorpay webhook signature validation
- **Idempotency**: Prevent duplicate billing operations
- **Route Guards**: Validate IDs before navigation

---

## 🛠️ Tech Stack

### Frontend

| Technology | Purpose | Version |
|------------|---------|---------|
| **Next.js** | React framework with App Router and Server Components | 15.5.7 |
| **TypeScript** | Type-safe JavaScript | 5.x |
| **React** | UI library | 18.x |
| **Tailwind CSS** | Utility-first CSS framework | 3.4.1 |
| **shadcn/ui** | Re-usable component library built on Radix UI | Latest |
| **Radix UI** | Unstyled, accessible UI primitives | Various |
| **Lucide React** | Icon library | 0.454.0 |
| **TanStack Query** | Data fetching and caching (React Query) | 5.59.19 |
| **TanStack Table** | Headless table library | 8.20.5 |
| **React Hook Form** | Form state management | 7.53.1 |
| **Zod** | Schema validation | 3.23.8 |
| **nuqs** | Type-safe URL search params | 2.7.1 |
| **Sonner** | Toast notifications | 1.7.0 |

### Backend & Data

| Technology | Purpose | Version |
|------------|---------|---------|
| **Appwrite** | Backend-as-a-Service (Auth, Database, Storage, Realtime) | 21.5.0 (client), 14.0.0 (server) |
| **Hono** | Lightweight web framework for API routes | 4.6.9 |
| **node-appwrite** | Server-side Appwrite SDK | 14.0.0 |

### AI & Integration

| Technology | Purpose | Version |
|------------|---------|---------|
| **Google Gemini API** | AI assistance (workflow, code analysis, docs) | gemini-2.5-flash-lite |
| **Razorpay** | Payment gateway and e-mandate | 2.9.4 |
| **GitHub API** | Repository integration | Via fetch |

### UI Libraries

| Technology | Purpose | Version |
|------------|---------|---------|
| **Tiptap** | Rich text editor | 2.11.5 |
| **React Big Calendar** | Calendar view | 1.14.1 |
| **Recharts** | Charting library | 2.13.3 |
| **@xyflow/react** | Flow diagram library | 12.10.0 |
| **@visx/** | D3-based visualization primitives | 3.12.0 |
| **@hello-pangea/dnd** | Drag and drop | 17.0.0 |
| **React Day Picker** | Date picker | 8.10.1 |
| **React Markdown** | Markdown rendering | 10.1.0 |
| **React Syntax Highlighter** | Code syntax highlighting | 16.1.0 |

### Export & File Handling

| Technology | Purpose | Version |
|------------|---------|---------|
| **jsPDF** | PDF generation | 3.0.3 |
| **docx** | Word document generation | 9.5.1 |
| **html-to-docx** | HTML to Word conversion | 1.8.0 |
| **marked** | Markdown parsing | 17.0.0 |

### Development & Testing

| Technology | Purpose | Version |
|------------|---------|---------|
| **Vitest** | Unit testing framework | 4.0.16 |
| **Playwright** | End-to-end testing | 1.57.0 |
| **ESLint** | Code linting | 8.x |
| **tsx** | TypeScript execution | 4.21.0 |

### Utilities

| Technology | Purpose | Version |
|------------|---------|---------|
| **date-fns** | Date manipulation | 3.0.0 |
| **clsx** | Conditional className utility | 2.1.1 |
| **tailwind-merge** | Tailwind class merging | 2.5.4 |
| **class-variance-authority** | Variant-based styling | 0.7.0 |
| **idb** | IndexedDB wrapper | 8.0.3 |
| **dotenv** | Environment variable loading | 17.2.3 |

---

## 🚀 Quick Start Guide

### Prerequisites

Before you begin, ensure you have:

- **Node.js** 18.17 or later
- **Package Manager**: npm, yarn, pnpm, or bun
- **Appwrite Instance**: Cloud account or self-hosted Appwrite server
- **Gemini API Key**: For AI features (get from [Google AI Studio](https://aistudio.google.com/app/apikey))
- **(Optional) Razorpay Account**: For billing features

### Step 1: Clone the Repository

```bash
git clone https://github.com/Happyesss/Fairlx.git
cd Fairlx
```

### Step 2: Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

### Step 3: Configure Appwrite

1. **Create an Appwrite Project**
   - Go to [Appwrite Cloud](https://cloud.appwrite.io) or your self-hosted instance
   - Create a new project
   - Copy the Project ID and API Endpoint

2. **Generate API Key**
   - Navigate to Project Settings → API Keys
   - Create a new API key with **all scopes**
   - Copy the API Key (keep it secure)

3. **Create Database and Collections**
   - Follow the complete setup guide: [md/APPWRITE_SETUP.md](md/APPWRITE_SETUP.md)
   - Or use the detailed schema reference: [md/APPWRITE_GUIDE.md](md/APPWRITE_GUIDE.md)
   - **Required Collections**: 35+ collections (workspaces, members, projects, tasks, spaces, workflows, etc.)
   - **Required Buckets**: 3 buckets (images, attachments_bucket, project-docs)

### Step 4: Configure Environment Variables

Create a `.env.local` file in the project root:

```env
# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Appwrite Configuration
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT=your_project_id_here
NEXT_APPWRITE_KEY=your_api_key_here
NEXT_PUBLIC_APPWRITE_DATABASE_ID=your_database_id

# AI Configuration (Gemini)
GEMINI_API_KEY=your_gemini_api_key_here

# ===============================
# Core Collections
# ===============================
NEXT_PUBLIC_APPWRITE_WORKSPACES_ID=workspaces
NEXT_PUBLIC_APPWRITE_MEMBERS_ID=members
NEXT_PUBLIC_APPWRITE_PROJECTS_ID=projects
NEXT_PUBLIC_APPWRITE_TASKS_ID=tasks
NEXT_PUBLIC_APPWRITE_TIME_LOGS_ID=time_logs
NEXT_PUBLIC_APPWRITE_SPRINTS_ID=sprints
NEXT_PUBLIC_APPWRITE_WORK_ITEMS_ID=work_items
NEXT_PUBLIC_APPWRITE_PERSONAL_BACKLOG_ID=personal_backlog
NEXT_PUBLIC_APPWRITE_SUBTASKS_ID=subtasks

# Custom Columns & Settings
NEXT_PUBLIC_APPWRITE_CUSTOM_COLUMNS_ID=custom_columns
NEXT_PUBLIC_APPWRITE_DEFAULT_COLUMN_SETTINGS_ID=default_column_settings

# Notifications
NEXT_PUBLIC_APPWRITE_NOTIFICATIONS_ID=notifications

# Storage Buckets
NEXT_PUBLIC_APPWRITE_IMAGES_BUCKET_ID=images
NEXT_PUBLIC_APPWRITE_ATTACHMENTS_BUCKET_ID=attachments_bucket
NEXT_PUBLIC_APPWRITE_PROJECT_DOCS_BUCKET_ID=project-docs

# Attachments & Comments
NEXT_PUBLIC_APPWRITE_ATTACHMENTS_ID=attachments
NEXT_PUBLIC_APPWRITE_COMMENTS_ID=comments

# ===============================
# Spaces & Workflows
# ===============================
NEXT_PUBLIC_APPWRITE_SPACES_ID=spaces
NEXT_PUBLIC_APPWRITE_SPACE_MEMBERS_ID=space_members
NEXT_PUBLIC_APPWRITE_WORKFLOWS_ID=workflows
NEXT_PUBLIC_APPWRITE_WORKFLOW_STATUSES_ID=workflow_statuses
NEXT_PUBLIC_APPWRITE_WORKFLOW_TRANSITIONS_ID=workflow_transitions

# Custom Fields
NEXT_PUBLIC_APPWRITE_CUSTOM_FIELDS_ID=custom_fields
NEXT_PUBLIC_APPWRITE_CUSTOM_WORK_ITEM_TYPES_ID=custom_work_item_types

# Work Item Links
NEXT_PUBLIC_APPWRITE_WORK_ITEM_LINKS_ID=work_item_links

# Saved Views
NEXT_PUBLIC_APPWRITE_SAVED_VIEWS_ID=saved_views

# ===============================
# Teams & Programs
# ===============================
NEXT_PUBLIC_APPWRITE_PROGRAMS_ID=programs
NEXT_PUBLIC_APPWRITE_PROGRAM_MEMBERS_ID=program_members
NEXT_PUBLIC_APPWRITE_PROGRAM_MILESTONES_ID=program_milestones

# Project Teams
NEXT_PUBLIC_APPWRITE_PROJECT_TEAMS_ID=project_teams
NEXT_PUBLIC_APPWRITE_PROJECT_TEAM_MEMBERS_ID=project_team_members
NEXT_PUBLIC_APPWRITE_PROJECT_MEMBERS_ID=project_members
NEXT_PUBLIC_APPWRITE_PROJECT_ROLES_ID=project_roles
NEXT_PUBLIC_APPWRITE_PROJECT_PERMISSIONS_ID=project_permissions
NEXT_PUBLIC_APPWRITE_CUSTOM_ROLES_ID=custom_roles

# ===============================
# Organizations & Account Management
# ===============================
NEXT_PUBLIC_APPWRITE_ORGANIZATIONS_ID=organizations
NEXT_PUBLIC_APPWRITE_ORGANIZATION_MEMBERS_ID=organization_members
NEXT_PUBLIC_APPWRITE_ORGANIZATION_AUDIT_LOGS_ID=organization_audit_logs
NEXT_PUBLIC_APPWRITE_LOGIN_TOKENS_ID=login_tokens

# Departments
NEXT_PUBLIC_APPWRITE_DEPARTMENTS_ID=departments
NEXT_PUBLIC_APPWRITE_ORG_MEMBER_DEPARTMENTS_ID=org_member_departments
NEXT_PUBLIC_APPWRITE_DEPARTMENT_PERMISSIONS_ID=department_permissions
NEXT_PUBLIC_APPWRITE_ORG_MEMBER_PERMISSIONS_ID=org_member_permissions

# ===============================
# GitHub Integration
# ===============================
NEXT_PUBLIC_APPWRITE_GITHUB_REPOS_ID=github_repos
NEXT_PUBLIC_APPWRITE_CODE_DOCS_ID=code_docs

# GitHub Personal Access Token (optional, for higher rate limits)
GH_PERSONAL_TOKEN=your_github_token_here

# ===============================
# Project Documents
# ===============================
NEXT_PUBLIC_APPWRITE_PROJECT_DOCS_ID=project_docs

# ===============================
# Billing & Usage Tracking
# ===============================
NEXT_PUBLIC_APPWRITE_USAGE_EVENTS_ID=usage_events
NEXT_PUBLIC_APPWRITE_USAGE_AGGREGATIONS_ID=usage_aggregations
NEXT_PUBLIC_APPWRITE_USAGE_ALERTS_ID=usage_alerts
NEXT_PUBLIC_APPWRITE_STORAGE_SNAPSHOTS_ID=storage_snapshots
NEXT_PUBLIC_APPWRITE_INVOICES_ID=invoices
NEXT_PUBLIC_APPWRITE_BILLING_ACCOUNTS_ID=billing_accounts
NEXT_PUBLIC_APPWRITE_BILLING_AUDIT_LOGS_ID=billing_audit_logs
NEXT_PUBLIC_APPWRITE_PROCESSED_EVENTS_ID=processed_events

# Wallet (optional)
NEXT_PUBLIC_APPWRITE_WALLETS_ID=wallets
NEXT_PUBLIC_APPWRITE_WALLET_TRANSACTIONS_ID=wallet_transactions
NEXT_PUBLIC_APPWRITE_BILLING_SETTINGS_ID=billing_settings

# ===============================
# Razorpay Configuration (Optional)
# ===============================
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
RAZORPAY_BASE_PLAN_ID=your_plan_id

# Exchange Rate API (optional)
EXCHANGE_RATE_API_KEY=your_exchange_rate_api_key

# ===============================
# Billing Configuration
# ===============================
BILLING_GRACE_PERIOD_DAYS=14
BILLING_CURRENCY=INR
USAGE_RATE_TRAFFIC_GB=0.10
USAGE_RATE_STORAGE_GB_MONTH=0.05
USAGE_RATE_COMPUTE_UNIT=0.001

# eMandate Feature Flag
ENABLE_EMANDATE=false

# Cron Secret (for automated billing)
CRON_SECRET=your_secure_cron_secret

# ===============================
# Email/Messaging (Optional)
# ===============================
NEXT_PUBLIC_APPWRITE_SMTP_PROVIDER_ID=smtp_provider
NEXT_PUBLIC_APPWRITE_EMAIL_TOPIC_ID=email_topic
```

> **Note**: See [`.env.example`](.env.example) for the complete template with all environment variables.

### Step 5: Run the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 6: Create Your First Account

1. Navigate to [http://localhost:3000](http://localhost:3000)
2. Click "Sign Up" and create an account
3. Verify your email (check Appwrite email settings)
4. Choose account type: **Personal** or **Organization**
5. Complete the onboarding flow
6. Create your first workspace

### Optional: Run with Custom Server (Socket.IO)

For real-time WebSocket notifications (alternative to Appwrite Realtime):

```bash
npm run dev  # Uses tsx server.ts automatically
```

The custom server (`server.ts`) runs both Next.js and Socket.IO on port 3000.

---

## 🏗️ Architecture & Data Flow

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Next.js 15  │  │  React 18    │  │  TailwindCSS │      │
│  │  App Router  │  │  Components  │  │  shadcn/ui   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│           │                  │                  │            │
│  ┌────────▼──────────────────▼──────────────────▼────────┐  │
│  │           TanStack Query (State Management)           │  │
│  └────────┬──────────────────┬───────────────────────────┘  │
└───────────┼──────────────────┼───────────────────────────────┘
            │                  │
   ┌────────▼──────┐  ┌────────▼────────┐
   │  Hono API     │  │  Server Actions │
   │  Routes       │  │  (RSC)          │
   └────────┬──────┘  └────────┬────────┘
            │                  │
   ┌────────▼──────────────────▼────────────┐
   │        Appwrite Backend                │
   │  ┌──────────┐  ┌──────────┐  ┌──────┐ │
   │  │   Auth   │  │ Database │  │ Store│ │
   │  └──────────┘  └──────────┘  └──────┘ │
   └────────────────────────────────────────┘
            │                  │
   ┌────────▼─────┐   ┌────────▼──────┐
   │ Gemini API   │   │  Razorpay API │
   │ (AI Features)│   │  (Billing)    │
   └──────────────┘   └───────────────┘
```

### Data Flow

1. **User Authentication**
   ```
   User → Next.js Auth Pages → Appwrite Auth API → Session Cookie
   → AccountLifecycleProvider → Context Available
   ```

2. **Account Lifecycle**
   ```
   Login → Check Verification → Check Onboarding → Check Billing Status
   → Route to Appropriate Page (Verify/Onboard/Dashboard/Billing)
   ```

3. **Data Fetching**
   ```
   Component → TanStack Query Hook → Hono API Route
   → Appwrite SDK → Database → Response Cache → UI Update
   ```

4. **Data Mutation**
   ```
   Form Submit → Zod Validation → Mutation Hook → Hono API Route
   → Billing Enforcement Check → Appwrite SDK → Database Write
   → Optimistic Update → Query Invalidation → UI Refresh
   ```

5. **Usage Tracking**
   ```
   User Action → Track Usage Utility → Create Usage Event
   → Daily Aggregation (Cron) → Monthly Invoice Generation
   → Razorpay Payment → Webhook → Update Billing Status
   ```

6. **AI Workflow**
   ```
   User Prompt → AI Assistant Component → Hono API Route
   → Gemini API Request → Parse Response → Validate Schema
   → Apply Changes → Database Update → UI Refresh
   ```

### Hierarchical Data Model

```
┌──────────────────────────────────────────────────────┐
│                   USER ACCOUNT                        │
│  ┌─────────────────┐         ┌──────────────────┐   │
│  │  PERSONAL       │   OR    │  ORGANIZATION    │   │
│  │  Single user    │         │  Multi-user      │   │
│  │  No billing     │         │  Shared billing  │   │
│  └────────┬────────┘         └────────┬─────────┘   │
└───────────┼──────────────────────────────┼────────────┘
            │                              │
            └──────────────┬───────────────┘
                           │
            ┌──────────────▼──────────────┐
            │        WORKSPACES           │
            │  Multiple per account       │
            │  UI Mode: Simple/Advanced   │
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │          SPACES              │
            │  (Optional intermediate)    │
            │  Department/Product/Client  │
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │         PROJECTS             │
            │  Scrum/Kanban/Hybrid        │
            │  Custom workflows           │
            │  Teams, Sprints, GitHub     │
            └──────────────┬──────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼────────┐  ┌──────▼───────┐  ┌──────▼───────┐
│   WORK ITEMS   │  │   SPRINTS    │  │    TEAMS     │
│ Tasks, Stories │  │  Planning    │  │   Members    │
│ Bugs, Epics    │  │  Active      │  │   Roles      │
│ Custom Fields  │  │  Completed   │  │  Permissions │
└────────┬───────┘  └──────────────┘  └──────────────┘
         │
    ┌────▼────┐
    │SUBTASKS │
    │ Details │
    └─────────┘
```

### Permission Hierarchy

```
ORGANIZATION (Org accounts only)
├── Owner        → Full control, billing, delete org
├── Admin        → Manage members, settings
├── Moderator    → Content management
└── Member       → Basic access
    │
    └─ WORKSPACE
        ├── Admin    → Full workspace control
        ├── Editor   → Create/edit content
        └── Viewer   → Read-only
            │
            └─ SPACE
                ├── Admin/Master → Full space control
                ├── Member       → Standard access
                └── Viewer       → Read-only
                    │
                    └─ PROJECT
                        ├── Admin       → Full project control
                        ├── Manager     → Manage sprints, assign
                        ├── Developer   → Work on tasks
                        └── Viewer      → Read-only
                            │
                            └─ TEAM
                                ├── Lead   → Team leadership
                                ├── Member → Team participation
                                └── Custom → Custom role
```

---

## 📁 Project Structure

```
Fairlx/
├── public/                        # Static assets
│   ├── Logo.png                   # Application logo
│   ├── favicon.png                # Favicon
│   └── apple-touch-icon.png       # iOS icon
│
├── docs/                          # Additional documentation
│   ├── APPWRITE_ORGANIZATIONS_SETUP.md
│   ├── DATABASE_UPDATES.md
│   ├── FEATURES_COMPLETE.md
│   ├── SPACES_GUIDE.md
│   └── SPACES_TESTING_GUIDE.md
│
├── md/                            # Setup and migration guides
│   ├── APPWRITE_GUIDE.md         # Complete schema reference
│   ├── APPWRITE_SETUP.md         # Setup instructions
│   └── MIGRATION_SETUP.md        # Migration procedures
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/                # Authentication routes
│   │   │   ├── sign-in/          # Sign-in page
│   │   │   ├── sign-up/          # Sign-up page
│   │   │   ├── verify-email/     # Email verification
│   │   │   ├── forgot-password/  # Password reset request
│   │   │   ├── reset-password/   # Password reset form
│   │   │   └── onboarding/       # Onboarding flow
│   │   │
│   │   ├── (dashboard)/           # Main application routes
│   │   │   ├── organization/     # Organization management
│   │   │   │   ├── settings/     # Org settings
│   │   │   │   ├── members/      # Member management
│   │   │   │   ├── billing/      # Billing dashboard
│   │   │   │   └── usage/        # Usage analytics
│   │   │   ├── profile/          # User profile
│   │   │   ├── welcome/          # Welcome page
│   │   │   └── workspaces/       # Workspace routes
│   │   │       └── [workspaceId]/
│   │   │           ├── settings/ # Workspace settings
│   │   │           ├── members/  # Workspace members
│   │   │           ├── spaces/   # Spaces management
│   │   │           │   └── [spaceId]/
│   │   │           │       ├── settings/
│   │   │           │       └── projects/
│   │   │           ├── programs/ # Programs management
│   │   │           └── projects/ # Projects
│   │   │               └── [projectId]/
│   │   │                   ├── tasks/
│   │   │                   ├── board/
│   │   │                   ├── list/
│   │   │                   ├── calendar/
│   │   │                   ├── timeline/
│   │   │                   ├── sprints/
│   │   │                   ├── workflows/
│   │   │                   ├── teams/
│   │   │                   ├── settings/
│   │   │                   └── github/
│   │   │
│   │   ├── (standalone)/          # Standalone pages
│   │   │   └── account-suspended/ # Suspension notice
│   │   │
│   │   ├── 403/                   # Forbidden page
│   │   ├── api/                   # API routes (Hono)
│   │   │   └── [[...route]]/      # Catch-all API router
│   │   ├── auth/                  # Auth callbacks
│   │   │   └── callback/          # OAuth callback
│   │   ├── oauth/                 # OAuth handlers
│   │   ├── fonts/                 # Custom fonts
│   │   ├── globals.css            # Global styles
│   │   ├── layout.tsx             # Root layout
│   │   ├── page.tsx               # Home/redirect page
│   │   ├── loading.tsx            # Global loading state
│   │   ├── error.tsx              # Global error boundary
│   │   ├── not-found.tsx          # 404 page
│   │   ├── apple-icon.tsx         # Dynamic iOS icon
│   │   └── icon.tsx               # Dynamic favicon
│   │
│   ├── components/                # Shared React components
│   │   ├── ui/                    # shadcn/ui primitives
│   │   │   ├── accordion.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── card.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── collapsible.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── form.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── radio-group.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── toaster.tsx
│   │   │   └── tooltip.tsx
│   │   │
│   │   ├── skeletons/             # Loading skeleton components
│   │   │   ├── card-skeleton.tsx
│   │   │   ├── list-skeleton.tsx
│   │   │   └── table-skeleton.tsx
│   │   │
│   │   ├── editor/                # Rich text editor components
│   │   │   └── tiptap-editor.tsx
│   │   │
│   │   ├── account-lifecycle-provider.tsx  # Account state management
│   │   ├── analytics-card.tsx              # Analytics display
│   │   ├── analytics.tsx                   # Analytics dashboard
│   │   ├── app-readiness-provider.tsx      # App initialization
│   │   ├── billing-entity-badge.tsx        # Billing status badge
│   │   ├── breadcrumb.tsx                  # Navigation breadcrumbs
│   │   ├── date-picker.tsx                 # Date selection
│   │   ├── dotted-separator.tsx            # Visual separator
│   │   ├── draft-cleanup.tsx               # Draft management
│   │   ├── empty-state-with-guide.tsx      # Empty state with help
│   │   ├── global-app-loader.tsx           # Global loading state
│   │   ├── help-tooltip.tsx                # Contextual help
│   │   ├── hierarchy-diagram.tsx           # Org structure diagram
│   │   ├── icon-help.tsx                   # Icon with help text
│   │   ├── lifecycle-guard.tsx             # Lifecycle routing
│   │   ├── mobile-sidebar.tsx              # Mobile navigation
│   │   ├── mode-toggle.tsx                 # Dark mode toggle
│   │   ├── navbar.tsx                      # Top navigation bar
│   │   ├── navigation.tsx                  # Main navigation
│   │   ├── onboarding-stepper.tsx          # Onboarding wizard
│   │   ├── page-error.tsx                  # Page-level error
│   │   ├── page-loader.tsx                 # Page loading state
│   │   ├── permission-guard.tsx            # Permission checking
│   │   ├── ProfileSidebar.tsx              # Profile menu
│   │   ├── project-permission-guard.tsx    # Project permissions
│   │   ├── project-permissions-editor.tsx  # Permission editor
│   │   ├── project-rbac-test.tsx           # RBAC testing
│   │   ├── project-tools.tsx               # Project utilities
│   │   ├── projects.tsx                    # Projects list
│   │   ├── query-provider.tsx              # TanStack Query setup
│   │   ├── responsive-modal.tsx            # Responsive modal
│   │   ├── Separator.tsx                   # Visual separator
│   │   ├── setting-navigation.tsx          # Settings nav
│   │   ├── sidebar.tsx                     # Main sidebar
│   │   ├── spaces.tsx                      # Spaces navigation
│   │   ├── task-details-modal.tsx          # Task details
│   │   ├── theme-provider.tsx              # Theme management
│   │   ├── tools.tsx                       # Utility tools
│   │   └── workspace-switcher.tsx          # Workspace selector
│   │
│   ├── features/                  # Feature modules (modular by domain)
│   │   ├── attachments/           # File attachment management
│   │   ├── audit-logs/            # Activity logging
│   │   ├── auth/                  # Authentication & authorization
│   │   ├── billing/               # Billing and invoicing
│   │   ├── comments/              # Comments and discussions
│   │   ├── currency/              # Currency handling
│   │   ├── custom-columns/        # Custom kanban columns
│   │   ├── custom-fields/         # Custom field definitions
│   │   ├── default-column-settings/ # Default column configs
│   │   ├── departments/           # Organization departments
│   │   ├── github-integration/    # GitHub repo integration
│   │   ├── members/               # Workspace membership
│   │   ├── notifications/         # Notification system
│   │   ├── onboarding/            # User onboarding
│   │   ├── org-permissions/       # Organization permissions
│   │   ├── organizations/         # Organization management
│   │   ├── personal-backlog/      # Personal work items
│   │   ├── programs/              # Program management
│   │   ├── project-docs/          # Project documentation
│   │   ├── project-members/       # Project membership
│   │   ├── project-teams/         # Project teams
│   │   ├── projects/              # Project management
│   │   ├── roles/                 # Custom roles
│   │   ├── saved-views/           # Saved filters/views
│   │   ├── spaces/                # Spaces management
│   │   ├── sprints/               # Sprint management
│   │   ├── subtasks/              # Subtask management
│   │   ├── tasks/                 # Task/work item management
│   │   ├── time-tracking/         # Time logging
│   │   ├── timeline/              # Timeline/Gantt view
│   │   ├── usage/                 # Usage tracking
│   │   ├── user-access/           # User access control
│   │   ├── wallet/                # Wallet system
│   │   ├── work-item-links/       # Work item relationships
│   │   ├── workflows/             # Custom workflows + AI
│   │   └── workspaces/            # Workspace management
│   │
│   │   # Each feature module typically contains:
│   │   # ├── api/                 # TanStack Query hooks
│   │   # ├── components/          # Feature-specific components
│   │   # ├── hooks/               # Feature-specific hooks
│   │   # ├── server/              # Hono API routes
│   │   # ├── types.ts             # TypeScript types
│   │   # └── schemas.ts           # Zod validation schemas
│   │
│   ├── hooks/                     # Shared custom hooks
│   │   ├── use-confirm.tsx        # Confirmation dialog hook
│   │   ├── use-debounce.ts        # Debounce utility hook
│   │   └── use-permission.ts      # Permission checking hook
│   │
│   ├── lib/                       # Core utility libraries
│   │   ├── appwrite.ts            # Appwrite client initialization
│   │   ├── billing-enforcement.ts # Billing middleware
│   │   ├── billing-utils.ts       # Billing utilities
│   │   ├── organization-utils.ts  # Organization helpers
│   │   ├── permission-matrix.ts   # Permission definitions
│   │   ├── permissions.ts         # Permission constants
│   │   ├── project-rbac.ts        # Project-level RBAC
│   │   ├── query-config.ts        # Query cache configuration
│   │   ├── rbac.ts                # RBAC implementation
│   │   ├── route-utils.ts         # Safe navigation utilities
│   │   ├── session-middleware.ts  # Session validation
│   │   ├── track-usage.ts         # Usage tracking
│   │   ├── usage-aggregation.ts   # Usage aggregation logic
│   │   ├── usage-billing.ts       # Usage billing logic
│   │   └── utils.ts               # General utilities
│   │
│   ├── types/                     # Shared TypeScript types
│   │   └── *.d.ts                 # Global type definitions
│   │
│   └── config.ts                  # Environment configuration
│
├── middleware.ts                  # Next.js middleware (auth)
├── server.ts                      # Custom server (Socket.IO)
├── components.json                # shadcn/ui configuration
├── tailwind.config.ts             # Tailwind CSS config
├── next.config.mjs                # Next.js configuration
├── next-env.d.ts                  # Next.js types
├── tsconfig.json                  # TypeScript config
├── tsconfig.server.json           # Server TypeScript config
├── vitest.config.ts               # Vitest configuration
├── playwright.config.ts           # Playwright configuration
├── postcss.config.mjs             # PostCSS configuration
├── package.json                   # Dependencies and scripts
├── .env.example                   # Environment template
├── .gitignore                     # Git ignore rules
├── README.md                      # This file
├── CONTRIBUTING.md                # Contribution guidelines
├── CODE_OF_CONDUCT.md             # Code of conduct
├── changelog.md                   # Changelog
├── DATABASE_UPDATES.md            # Database updates log
└── PROGRAMS_IMPLEMENTATION_GUIDE.md # Programs guide
```

---

## 🔧 Environment Configuration

### Required Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `NEXT_PUBLIC_APP_URL` | Application base URL | `http://localhost:3000` |
| `NEXT_PUBLIC_APPWRITE_ENDPOINT` | Appwrite API endpoint | `https://cloud.appwrite.io/v1` |
| `NEXT_PUBLIC_APPWRITE_PROJECT` | Appwrite project ID | `my-project-id` |
| `NEXT_APPWRITE_KEY` | Appwrite server API key | `secret-api-key` |
| `NEXT_PUBLIC_APPWRITE_DATABASE_ID` | Main database ID | `main-database` |
| `GEMINI_API_KEY` | Google Gemini API key for AI features | `AIza...` |

### Collection Environment Variables

All collection IDs must be configured. See [`.env.example`](.env.example) for the complete list including:

- **Core Collections**: workspaces, members, projects, tasks, sprints, etc.
- **Spaces & Workflows**: spaces, workflows, workflow_statuses, workflow_transitions
- **Custom Features**: custom_fields, custom_columns, saved_views
- **Teams & Programs**: programs, project_teams, project_members, roles
- **Organizations**: organizations, organization_members, departments
- **Billing & Usage**: usage_events, invoices, billing_accounts
- **Collaboration**: comments, attachments, notifications
- **Integration**: github_repos, code_docs, project_docs

### Storage Bucket Environment Variables

| Variable | Purpose | Max Size |
|----------|---------|----------|
| `NEXT_PUBLIC_APPWRITE_IMAGES_BUCKET_ID` | User avatars, workspace images | N/A |
| `NEXT_PUBLIC_APPWRITE_ATTACHMENTS_BUCKET_ID` | Task attachments | 20MB per file |
| `NEXT_PUBLIC_APPWRITE_PROJECT_DOCS_BUCKET_ID` | Project documentation files | 5GB total |

### Optional Environment Variables

#### Billing Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `RAZORPAY_KEY_ID` | Razorpay public key | - |
| `RAZORPAY_KEY_SECRET` | Razorpay secret key | - |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook verification | - |
| `BILLING_GRACE_PERIOD_DAYS` | Days before suspension | `14` |
| `BILLING_CURRENCY` | Default currency | `INR` |
| `USAGE_RATE_TRAFFIC_GB` | Cost per GB traffic (cents) | `0.10` |
| `USAGE_RATE_STORAGE_GB_MONTH` | Cost per GB/month storage (cents) | `0.05` |
| `USAGE_RATE_COMPUTE_UNIT` | Cost per compute unit (cents) | `0.001` |
| `ENABLE_EMANDATE` | Enable Razorpay e-mandate | `false` |
| `CRON_SECRET` | Secret for cron endpoints | - |

#### GitHub Integration

| Variable | Purpose | Default |
|----------|---------|---------|
| `GH_PERSONAL_TOKEN` | GitHub personal access token for higher rate limits | - |

#### Email/Messaging

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_APPWRITE_SMTP_PROVIDER_ID` | SMTP provider ID in Appwrite | - |
| `NEXT_PUBLIC_APPWRITE_EMAIL_TOPIC_ID` | Email notification topic ID | - |

---

## 📦 Feature Modules

Fairlx is built with a **modular feature architecture**. Each feature is self-contained with its own API, components, hooks, server routes, types, and schemas.

### Feature Module Structure

```
src/features/{feature-name}/
├── api/                    # TanStack Query hooks
│   ├── use-get-*.ts        # Query hooks (data fetching)
│   ├── use-create-*.ts     # Mutation hooks (create)
│   ├── use-update-*.ts     # Mutation hooks (update)
│   └── use-delete-*.ts     # Mutation hooks (delete)
├── components/             # React components
│   ├── *-form.tsx          # Form components
│   ├── *-list.tsx          # List views
│   ├── *-card.tsx          # Card views
│   └── *-modal.tsx         # Modal dialogs
├── hooks/                  # Custom hooks
│   ├── use-*.ts            # Feature-specific hooks
│   └── use-*-modal.ts      # Modal state hooks
├── server/                 # API routes (Hono)
│   └── route.ts            # Hono route definitions
├── types.ts                # TypeScript type definitions
├── schemas.ts              # Zod validation schemas
├── constants.ts            # Constants (optional)
├── utils.ts                # Utility functions (optional)
└── queries.ts              # Server-side queries (optional)
```

### Complete Feature List

#### Core Features (10)

| Feature | Description | Key Files |
|---------|-------------|-----------|
| **auth** | Authentication, OAuth, email verification, password management | `api/use-login.ts`, `api/use-register.ts`, `components/sign-in-card.tsx` |
| **organizations** | Multi-tenant organization management with billing | `api/use-get-organization.ts`, `server/route.ts`, `types.ts` |
| **workspaces** | Workspace CRUD with UI modes and feature toggles | `api/use-get-workspaces.ts`, `components/create-workspace-form.tsx` |
| **spaces** | Logical containers with unique keys for work item prefixing | `api/use-get-spaces.ts`, `components/create-space-form.tsx` |
| **projects** | Project management with board types and GitHub integration | `api/use-get-project.ts`, `components/edit-project-form.tsx` |
| **tasks** | Work items (Tasks, Stories, Bugs, Epics) with custom fields | `api/use-get-task.ts`, `components/task-view-switcher.tsx` |
| **members** | Workspace membership and role management | `api/use-get-members.ts`, `components/members-list.tsx` |
| **programs** | Cross-team program management with status tracking | `api/use-get-programs.ts`, `components/create-program-form.tsx` |
| **onboarding** | User onboarding flow with account type selection | `hooks/use-onboarding-state.ts`, `components/onboarding-stepper.tsx` |
| **user-access** | User access control and permission management | `api/use-get-user-access.ts` |

#### Work Management (6)

| Feature | Description | Key Files |
|---------|-------------|-----------|
| **sprints** | Sprint planning with velocity and burndown tracking | `api/use-get-sprint.ts`, `components/sprint-board.tsx` |
| **subtasks** | Hierarchical subtask management | `api/use-get-subtasks.ts`, `components/subtask-list.tsx` |
| **work-item-links** | 8 relationship types (blocks, relates, duplicates, etc.) | `api/use-get-links.ts`, `types.ts` |
| **personal-backlog** | Personal work queue independent of projects | `api/use-get-backlog.ts` |
| **saved-views** | Custom filters for Kanban/List/Calendar/Timeline | `api/use-get-views.ts`, `components/view-selector.tsx` |
| **timeline** | Gantt-style project timelines | `components/timeline-view.tsx` |

#### Customization (5)

| Feature | Description | Key Files |
|---------|-------------|-----------|
| **workflows** | Custom status flows with AI assistance | `api/use-get-workflow.ts`, `components/workflow-builder.tsx` |
| **custom-fields** | 10+ field types (text, number, date, select, etc.) | `api/use-get-fields.ts`, `types.ts` |
| **custom-columns** | Kanban column customization | `api/use-get-columns.ts` |
| **default-column-settings** | Default column configurations | `api/use-get-default-columns.ts` |
| **roles** | Custom role definitions with permission sets | `api/use-get-roles.ts`, `components/role-editor.tsx` |

#### Team Management (4)

| Feature | Description | Key Files |
|---------|-------------|-----------|
| **project-teams** | Project-scoped team management | `api/use-get-teams.ts`, `components/create-team-form.tsx` |
| **project-members** | Project membership and roles | `api/use-get-project-members.ts` |
| **departments** | Organization-level department grouping | `api/use-get-departments.ts` |
| **org-permissions** | Organization permission management | `api/use-get-org-permissions.ts` |

#### Collaboration (4)

| Feature | Description | Key Files |
|---------|-------------|-----------|
| **comments** | Threaded comments with @mentions | `api/use-get-comments.ts`, `components/comment-list.tsx` |
| **attachments** | File uploads (20MB limit) | `api/use-upload-attachment.ts` |
| **project-docs** | Rich documentation with AI chat | `api/use-get-docs.ts`, `components/doc-editor.tsx` |
| **notifications** | Real-time notification system | `api/use-get-notifications.ts`, `components/notification-panel.tsx` |

#### Integration & Analytics (4)

| Feature | Description | Key Files |
|---------|-------------|-----------|
| **github-integration** | GitHub repo linking with AI docs | `api/use-get-repos.ts`, `lib/gemini-api.ts` |
| **audit-logs** | Organization activity logging | `api/use-get-audit-logs.ts` |
| **usage** | Usage metering for billing | `api/use-get-usage.ts`, `lib/track-usage.ts` |
| **time-tracking** | Time logging and variance analysis | `api/use-create-time-log.ts` |

#### Billing (3)

| Feature | Description | Key Files |
|---------|-------------|-----------|
| **billing** | Billing accounts and invoice management | `api/use-get-billing-account.ts`, `server/route.ts` |
| **wallet** | Prepaid wallet system | `api/use-get-wallet.ts` |
| **currency** | Multi-currency support | `api/use-get-currency.ts` |

---

## 🔐 Permission & RBAC System

Fairlx implements a **hierarchical role-based access control (RBAC)** system with permissions cascading down from organization to workspace to space to project to team.

### Permission Levels

```
┌─────────────────────────────────────────────────────────┐
│  LEVEL 1: ORGANIZATION (Org Accounts Only)              │
│  ├── OWNER      → Full control, billing, delete org     │
│  ├── ADMIN      → Manage members, settings, workspaces  │
│  ├── MODERATOR  → Content management, limited admin     │
│  └── MEMBER     → Basic access to resources             │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  LEVEL 2: WORKSPACE                                      │
│  ├── WS_ADMIN   → Full workspace control                │
│  ├── WS_EDITOR  → Create/edit projects, spaces, tasks   │
│  └── WS_VIEWER  → Read-only workspace access            │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  LEVEL 3: SPACE (Optional)                               │
│  ├── ADMIN/MASTER → Full space control                  │
│  ├── MEMBER       → Standard space access               │
│  └── VIEWER       → Read-only space access              │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  LEVEL 4: PROJECT                                        │
│  ├── PROJECT_ADMIN → Full project control               │
│  ├── MANAGER       → Manage sprints, assign tasks       │
│  ├── DEVELOPER     → Work on assigned tasks             │
│  └── VIEWER        → Read-only project access           │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  LEVEL 5: TEAM (Project-Scoped)                         │
│  ├── LEAD          → Team leadership and oversight      │
│  ├── MEMBER        → Team participation                 │
│  └── CUSTOM        → Custom role with specific perms    │
└─────────────────────────────────────────────────────────┘
```

### Permission Matrix

#### Organization Permissions (Org Account Only)

| Action | Owner | Admin | Moderator | Member |
|--------|-------|-------|-----------|--------|
| Delete organization | ✅ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ✅ | ❌ | ❌ |
| Add/remove admins | ✅ | ❌ | ❌ | ❌ |
| Add/remove members | ✅ | ✅ | ✅ | ❌ |
| Create workspaces | ✅ | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ✅ | ❌ |
| Manage departments | ✅ | ✅ | ❌ | ❌ |

#### Workspace Permissions

| Action | WS_ADMIN | WS_EDITOR | WS_VIEWER |
|--------|----------|-----------|-----------|
| Delete workspace | ✅ | ❌ | ❌ |
| Edit workspace settings | ✅ | ❌ | ❌ |
| Add/remove members | ✅ | ❌ | ❌ |
| Create spaces | ✅ | ✅ | ❌ |
| Create projects | ✅ | ✅ | ❌ |
| Create tasks | ✅ | ✅ | ❌ |
| View all content | ✅ | ✅ | ✅ |

#### Project Permissions

| Action | PROJECT_ADMIN | MANAGER | DEVELOPER | VIEWER |
|--------|---------------|---------|-----------|--------|
| Delete project | ✅ | ❌ | ❌ | ❌ |
| Edit project settings | ✅ | ✅ | ❌ | ❌ |
| Manage teams | ✅ | ✅ | ❌ | ❌ |
| Create sprints | ✅ | ✅ | ❌ | ❌ |
| Assign tasks | ✅ | ✅ | ❌ | ❌ |
| Update task status | ✅ | ✅ | ✅ | ❌ |
| Comment on tasks | ✅ | ✅ | ✅ | ❌ |
| View tasks | ✅ | ✅ | ✅ | ✅ |

### Implementation Files

| File | Purpose |
|------|---------|
| [src/lib/permissions.ts](src/lib/permissions.ts) | Permission constant definitions |
| [src/lib/permission-matrix.ts](src/lib/permission-matrix.ts) | Full permission matrix |
| [src/lib/rbac.ts](src/lib/rbac.ts) | RBAC utility functions |
| [src/lib/project-rbac.ts](src/lib/project-rbac.ts) | Project-level RBAC |
| [src/components/permission-guard.tsx](src/components/permission-guard.tsx) | React permission guard component |
| [src/components/project-permission-guard.tsx](src/components/project-permission-guard.tsx) | Project permission guard |
| [src/lib/organization-utils.ts](src/lib/organization-utils.ts) | Organization permission utilities |

### Server-Side Permission Enforcement

All Hono API routes enforce permissions server-side:

```typescript
// Example from src/features/projects/server/route.ts
app.delete("/:projectId", sessionMiddleware, async (c) => {
  const user = c.get("user");
  const { projectId } = c.req.param();
  
  // Check project admin permission
  const hasPermission = await checkProjectPermission(
    user.$id,
    projectId,
    "DELETE_PROJECT"
  );
  
  if (!hasPermission) {
    return c.json({ error: "Forbidden" }, 403);
  }
  
  // Proceed with deletion
  // ...
});
```

---

## 💳 Billing & Usage Tracking

Fairlx implements a **production-ready usage-based billing system** with automated metering, invoicing, and account lifecycle management.

### Billing Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   USER ACTIONS                           │
│  File Upload │ API Call │ Storage │ Database Query      │
└────────┬─────────────┬──────────┬──────────────────────┘
         │             │          │
         ▼             ▼          ▼
┌─────────────────────────────────────────────────────────┐
│           USAGE TRACKING (track-usage.ts)               │
│  Records events: traffic, storage, compute              │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│       USAGE_EVENTS Collection (Appwrite)                │
│  { organizationId, type, amount, timestamp }            │
└────────┬────────────────────────────────────────────────┘
         │
         ▼ (Daily Cron)
┌─────────────────────────────────────────────────────────┐
│    USAGE AGGREGATION (usage-aggregation.ts)             │
│  Daily rollup of events per organization                │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│    USAGE_AGGREGATIONS Collection (Appwrite)             │
│  { date, organizationId, traffic, storage, compute }    │
└────────┬────────────────────────────────────────────────┘
         │
         ▼ (Monthly Cron - 1st of month)
┌─────────────────────────────────────────────────────────┐
│        BILLING CYCLE (usage-billing.ts)                 │
│  1. Calculate costs from aggregations                   │
│  2. Create invoice                                      │
│  3. Attempt payment via Razorpay                        │
└────────┬────────────────────────────────────────────────┘
         │
         ├─ SUCCESS ──────────────────────────────────────┐
         │                                                 │
         ▼                                                 ▼
┌─────────────────────┐                   ┌────────────────────────────┐
│  Invoice: PAID      │                   │  Account Status: ACTIVE    │
│  Billing Account:   │                   │  Full access granted       │
│  Status = ACTIVE    │                   └────────────────────────────┘
└─────────────────────┘
         │
         └─ FAILURE ──────────────────────────────────────┐
                                                           │
                                                           ▼
                                           ┌────────────────────────────┐
                                           │  Invoice: FAILED           │
                                           │  Account Status: DUE       │
                                           │  Grace period starts (14d) │
                                           └─────────┬──────────────────┘
                                                     │
                                                     ▼ (Grace period expired)
                                           ┌────────────────────────────┐
                                           │  Account Status: SUSPENDED │
                                           │  Writes blocked            │
                                           │  Reads allowed             │
                                           └────────────────────────────┘
```

### Usage Metering

Three types of usage are tracked:

| Type | Measurement | Rate (Default) |
|------|-------------|----------------|
| **Traffic** | Data transfer (GB) | ₹0.10 per GB |
| **Storage** | Storage used (GB/month) | ₹0.05 per GB/month |
| **Compute** | Compute units (API calls, operations) | ₹0.001 per unit |

### Billing Lifecycle

1. **Usage Tracking** (Continuous)
   - Every user action creates a usage event
   - Events stored in `usage_events` collection
   - Tracked: organizationId, type, amount, timestamp

2. **Daily Aggregation** (Cron - 1 AM UTC)
   - Rollup events into daily totals
   - Store in `usage_aggregations` collection
   - Cleanup old events (retention policy)

3. **Monthly Billing Cycle** (Cron - 1st of month)
   - Calculate total usage from aggregations
   - Generate invoice with breakdown
   - Attempt Razorpay payment (e-mandate)
   - Update account status

4. **Grace Period** (14 days default)
   - Day 1: Payment failed, status → DUE
   - Day 1: Send email notification
   - Day 7: Send reminder email
   - Day 13: Send final warning
   - Day 14: Account suspended

5. **Account Suspension**
   - Status → SUSPENDED
   - Writes blocked (middleware enforcement)
   - Reads allowed
   - Billing page accessible for payment

6. **Recovery**
   - User completes payment
   - Status → ACTIVE
   - Access restored immediately

### Billing Enforcement

Middleware prevents mutations for suspended accounts:

```typescript
// src/lib/billing-enforcement.ts
export const mutationGuard = async (c: Context, next: () => Promise<void>) => {
  const user = c.get("user");
  
  // Check if organization account
  if (user.prefs.accountType === "ORG") {
    const billingAccount = await getBillingAccount(
      user.prefs.primaryOrganizationId
    );
    
    if (billingAccount.status === "SUSPENDED") {
      return c.json({ error: "Account suspended. Please update billing." }, 402);
    }
  }
  
  await next();
};
```

### Razorpay Integration

- **E-Mandate**: Automated monthly debit from customer's account
- **Webhooks**: `payment.captured`, `payment.failed`, `refund.processed`
- **Signature Verification**: All webhooks validated before processing
- **Idempotency**: Processed events registry prevents duplicate operations

### Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `BILLING_GRACE_PERIOD_DAYS` | Days before suspension | 14 |
| `BILLING_CURRENCY` | Invoice currency | INR |
| `USAGE_RATE_TRAFFIC_GB` | Cost per GB traffic (cents) | 0.10 |
| `USAGE_RATE_STORAGE_GB_MONTH` | Cost per GB/month storage (cents) | 0.05 |
| `USAGE_RATE_COMPUTE_UNIT` | Cost per compute unit (cents) | 0.001 |
| `ENABLE_EMANDATE` | Enable e-mandate | false |

### Billing Collections

| Collection | Purpose |
|------------|---------|
| `billing_accounts` | Organization billing accounts |
| `invoices` | Generated invoices with usage breakdown |
| `usage_events` | Raw usage events |
| `usage_aggregations` | Daily usage rollups |
| `storage_snapshots` | Storage usage snapshots |
| `billing_audit_logs` | Billing activity audit trail |
| `processed_events` | Idempotency registry |
| `usage_alerts` | Usage threshold alerts |

---

## 🤖 AI Features

Fairlx integrates **Google Gemini AI** (`gemini-2.5-flash-lite`) for intelligent workflow assistance, code analysis, and documentation generation.

### Workflow AI Assistant

The Workflow AI Assistant helps build and optimize custom workflows:

#### Features

1. **Analyze Workflow**
   - Identifies orphaned statuses (no incoming transitions)
   - Detects unreachable statuses (no path from initial status)
   - Finds dead-end statuses (no outgoing transitions)
   - Suggests improvements

2. **Suggest New Statuses**
   - Analyzes current workflow context
   - Recommends additional statuses based on project type
   - Suggests icons and colors
   - Provides justification

3. **Suggest Transitions**
   - Recommends logical state transitions
   - Suggests conditions and rules
   - Proposes team-based restrictions
   - Identifies approval requirements

4. **Generate Workflow Templates**
   - Natural language workflow creation
   - Example: "Create a software development workflow with code review"
   - Generates complete workflow with statuses and transitions

5. **Workflow Q&A**
   - Ask questions about workflow structure
   - Get explanations for transitions
   - Understand workflow logic

#### Implementation

```typescript
// src/features/workflows/server/route.ts
app.post("/:workflowId/ai/suggest-statuses", async (c) => {
  const { workflowId } = c.req.param();
  const workflow = await getWorkflow(workflowId);
  const statuses = await getWorkflowStatuses(workflowId);
  
  // Call Gemini API
  const suggestions = await geminiSuggestStatuses({
    workflowName: workflow.name,
    existingStatuses: statuses,
    projectContext: workflow.projectContext
  });
  
  return c.json({ suggestions });
});
```

### GitHub Integration AI

#### Features

1. **Auto-Generated Code Documentation**
   - Analyzes repository structure
   - Generates comprehensive documentation
   - Explains code architecture
   - Documents key functions and classes

2. **Code Q&A**
   - Ask questions about codebase
   - Get explanations with file references
   - Understand complex code patterns
   - Deep link to specific files and lines

3. **Commit Summarization**
   - Analyzes commit diffs
   - Generates meaningful summaries
   - Identifies breaking changes
   - Categorizes changes (feat/fix/docs)

#### Implementation

```typescript
// src/features/github-integration/lib/gemini-api.ts
export async function analyzeRepository(repoContent: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze this repository and generate documentation: ${repoContent}`
          }]
        }]
      })
    }
  );
  
  return await response.json();
}
```

### Project Documentation AI

#### Features

1. **Auto-Generate PRDs**
   - Product Requirements Documents from project context
   - Includes goals, features, user stories
   - Technical requirements and constraints

2. **Technical Specifications**
   - Architecture diagrams (text-based)
   - Data models and schemas
   - API documentation
   - Integration details

3. **API Documentation**
   - Endpoint documentation from code
   - Request/response examples
   - Authentication details
   - Error handling

#### Example Usage

```typescript
// Generate PRD
const prd = await generateDocument({
  type: "PRD",
  projectName: "Mobile App",
  context: {
    goals: ["User authentication", "Real-time chat"],
    stakeholders: ["Product Manager", "Engineering Team"]
  }
});
```

### AI Configuration

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Google Gemini API key (required for AI features) |

### AI Usage Tracking

AI operations count as compute units for billing:
- Workflow analysis: 1 compute unit
- Status suggestion: 2 compute units
- Code documentation: 5-10 compute units (depends on repo size)
- Q&A query: 1 compute unit

---

## 🔧 Development Workflow

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with custom server (port 3000) |
| `npm run dev:next-only` | Start Next.js only (without Socket.IO) |
| `npm run build` | Create production build |
| `npm run start` | Start production Next.js server |
| `npm run start:socket` | Start production custom server with Socket.IO |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once |

### Development Guidelines

#### TypeScript

- **Strict mode enabled**: All code must satisfy TypeScript strict checks
- **Explicit types**: Prefer explicit type annotations over inference
- **No `any`**: Use specific types or `unknown` if type is truly unknown
- **Type imports**: Use `import type` for type-only imports

```typescript
// Good
import type { User } from "@/types";
const user: User = await getUser(id);

// Bad
import { User } from "@/types";
const user = await getUser(id);  // Relies on inference
```

#### Server Components vs Client Components

- **Default to Server Components**: Use unless client interactivity required
- **Client Components**: Only for interactivity, browser APIs, React hooks
- **Mark with `"use client"`**: At the top of client component files

```typescript
// Client component (interactive)
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

// Server component (default)
export async function UserList() {
  const users = await getUsers();  // Server-side data fetch
  return <div>{users.map(u => <UserCard key={u.id} user={u} />)}</div>;
}
```

#### Tailwind CSS

- **Utility-first**: Use Tailwind utilities instead of custom CSS
- **Responsive**: Mobile-first responsive design
- **Dark mode**: Support light, dark, and pitch-dark themes
- **Component composition**: Compose utilities with `cn()` helper

```typescript
import { cn } from "@/lib/utils";

<div className={cn(
  "px-4 py-2 rounded-lg",
  "bg-white dark:bg-slate-800",
  isActive && "border-2 border-blue-500"
)} />
```

#### shadcn/ui Components

- **Use existing components**: Don't recreate primitives
- **Extend with variants**: Use `class-variance-authority` for variations
- **Composition over props**: Compose primitives instead of complex props

```typescript
import { Button } from "@/components/ui/button";

// Good - composition
<Button variant="outline" size="sm">Click</Button>

// Bad - custom styling
<button className="...custom classes...">Click</button>
```

#### API Routes (Hono)

- **Session middleware**: Always use for protected routes
- **Zod validation**: Validate all inputs
- **Error handling**: Return appropriate HTTP status codes
- **Type safety**: Use Hono's type inference

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sessionMiddleware } from "@/lib/session-middleware";
import { createFeatureSchema } from "./schemas";

const app = new Hono()
  .post(
    "/",
    sessionMiddleware,
    zValidator("json", createFeatureSchema),
    async (c) => {
      const user = c.get("user");
      const data = c.req.valid("json");
      
      // Implementation
      return c.json({ data: result });
    }
  );
```

#### TanStack Query

- **Query hooks**: For data fetching (GET operations)
- **Mutation hooks**: For data modification (POST/PATCH/DELETE)
- **Query keys**: Use consistent key structure
- **Cache invalidation**: Invalidate related queries after mutations

```typescript
// Query hook
export const useGetFeatures = (workspaceId: string) => {
  return useQuery({
    queryKey: ["features", workspaceId],
    queryFn: async () => {
      const response = await client.api.features.$get({
        query: { workspaceId }
      });
      return await response.json();
    },
    staleTime: 5 * 60 * 1000,  // 5 minutes
  });
};

// Mutation hook
export const useCreateFeature = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateFeatureData) => {
      const response = await client.api.features.$post({ json: data });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["features"] });
    },
  });
};
```

#### Route Utilities

- **Safe navigation**: Always use route utilities for navigation
- **Validate IDs**: Never navigate with undefined/invalid IDs
- **Type safety**: Route utilities provide compile-time type checking

```typescript
import { buildWorkspaceRoute } from "@/lib/route-utils";
import { useRouter } from "next/navigation";

const router = useRouter();

// Good
const route = buildWorkspaceRoute(workspaceId, "/settings");
router.push(route);

// Bad
router.push(`/workspaces/${workspaceId}/settings`);  // No validation
```

#### File Uploads

- **Validate size**: Check file size before upload
- **Validate type**: Check MIME type
- **Use buckets**: Upload to appropriate Appwrite bucket
- **Show progress**: Display upload progress to user

```typescript
const file = event.target.files[0];

// Validate
if (file.size > 20 * 1024 * 1024) {
  toast.error("File too large (max 20MB)");
  return;
}

// Upload
const result = await storage.createFile(
  ATTACHMENTS_BUCKET_ID,
  ID.unique(),
  file
);
```

### Code Style

- **Formatting**: Use Prettier defaults (enforced by ESLint)
- **Naming**:
  - Components: PascalCase (`UserCard.tsx`)
  - Hooks: camelCase with `use` prefix (`usePermission.ts`)
  - Utilities: camelCase (`formatDate.ts`)
  - Constants: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- **Imports**: Order by external → internal → relative
- **Comments**: Explain "why", not "what"

---

## 🧪 Testing

### Testing Stack

- **Unit & Integration**: Vitest
- **End-to-End**: Playwright

### Running Tests

```bash
# Unit tests (watch mode)
npm run test

# Unit tests (single run)
npm run test:run

# E2E tests
npx playwright test

# E2E tests (headed mode)
npx playwright test --headed

# E2E tests (UI mode)
npx playwright test --ui
```

### Test Structure

```
src/
├── features/
│   └── {feature}/
│       ├── __tests__/           # Feature tests
│       │   ├── api.test.ts      # API tests
│       │   └── utils.test.ts    # Utility tests
│       └── ...
tests/
└── e2e/                         # Playwright tests
    ├── auth.spec.ts
    ├── workspace.spec.ts
    └── project.spec.ts
```

### Writing Tests

#### Unit Tests (Vitest)

```typescript
import { describe, it, expect } from "vitest";
import { formatDate } from "../utils";

describe("formatDate", () => {
  it("formats date correctly", () => {
    const date = new Date("2024-01-01");
    expect(formatDate(date)).toBe("January 1, 2024");
  });
});
```

#### E2E Tests (Playwright)

```typescript
import { test, expect } from "@playwright/test";

test("user can create workspace", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Create Workspace");
  await page.fill("input[name='name']", "Test Workspace");
  await page.click("button:has-text('Create')");
  await expect(page.locator("text=Test Workspace")).toBeVisible();
});
```

---

## 🚀 Deployment

### Vercel (Recommended)

1. **Import Repository**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository

2. **Configure Environment**
   - Add all environment variables from `.env.example`
   - Set `NEXT_PUBLIC_APP_URL` to your Vercel domain

3. **Deploy**
   - Vercel automatically builds and deploys
   - Subsequent pushes to `main` trigger automatic deployments

### Docker

#### Dockerfile

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

#### Build and Run

```bash
# Build image
docker build -t fairlx .

# Run container
docker run -p 3000:3000 \
  --env-file .env.local \
  fairlx
```

### Docker Compose

```yaml
version: "3.8"

services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    restart: unless-stopped

  # Optional: Appwrite (self-hosted)
  appwrite:
    image: appwrite/appwrite:1.4
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - appwrite-config:/storage/config
      - appwrite-certificates:/storage/certificates
      - appwrite-functions:/storage/functions
      - appwrite-uploads:/storage/uploads
      - appwrite-cache:/storage/cache
    environment:
      - _APP_ENV=production
      - _APP_OPENSSL_KEY_V1=your-secret-key
      - _APP_DOMAIN=your-domain.com
      - _APP_DOMAIN_TARGET=your-domain.com
    restart: unless-stopped

volumes:
  appwrite-config:
  appwrite-certificates:
  appwrite-functions:
  appwrite-uploads:
  appwrite-cache:
```

### Environment Variables in Production

Ensure all required variables are set:

```bash
# Critical
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT=prod-project-id
NEXT_APPWRITE_KEY=prod-api-key
GEMINI_API_KEY=prod-gemini-key

# Billing (if enabled)
RAZORPAY_KEY_ID=prod-key
RAZORPAY_KEY_SECRET=prod-secret
RAZORPAY_WEBHOOK_SECRET=webhook-secret
CRON_SECRET=secure-cron-secret

# All collection and bucket IDs
# ... (see .env.example)
```

---

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and development process.

### Quick Contribution Guide

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** following the development guidelines
4. **Run tests**: `npm run test && npm run lint`
5. **Commit**: `git commit -m 'Add amazing feature'`
6. **Push**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Contribution Types

- 🐛 **Bug fixes**: Fix issues and edge cases
- ✨ **Features**: Add new capabilities
- 📝 **Documentation**: Improve docs, add examples
- 🎨 **UI/UX**: Enhance design and user experience
- ⚡ **Performance**: Optimize speed and efficiency
- ♿ **Accessibility**: Improve a11y compliance
- 🌍 **Internationalization**: Add translations

---

## 🔐 Security

### Security Measures

| Feature | Implementation |
|---------|----------------|
| **Authentication** | Appwrite Auth with email verification required |
| **OAuth** | Secure Google and GitHub OAuth integration |
| **Password Security** | Bcrypt hashing, reset via secure tokens |
| **Session Management** | HTTP-only cookies, automatic expiration |
| **RBAC** | Multi-level role-based access control |
| **Billing Enforcement** | Middleware blocks writes for suspended accounts |
| **Server-side Validation** | Never trust client-provided IDs or data |
| **Webhook Verification** | Razorpay signature validation |
| **Idempotency** | Prevent duplicate operations with event registry |
| **Data Encryption** | At rest (Appwrite) and in transit (HTTPS) |
| **File Upload Validation** | Size limits, type checking, antivirus scanning |
| **Route Guards** | Prevent navigation with invalid IDs |
| **Environment Secrets** | All secrets in `.env.local`, never committed |

### Reporting Vulnerabilities

**Do not report security vulnerabilities via public GitHub issues.**

To report a vulnerability:
1. Email: security@fairlx.com (if available)
2. Use GitHub's private vulnerability reporting
3. Provide detailed information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to address the issue.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

Fairlx is built with amazing open-source technologies:

- [Next.js](https://nextjs.org) - React framework
- [Appwrite](https://appwrite.io) - Backend-as-a-Service
- [Radix UI](https://www.radix-ui.com) - Unstyled, accessible UI primitives
- [shadcn/ui](https://ui.shadcn.com) - Re-usable component library
- [Tailwind CSS](https://tailwindcss.com) - Utility-first CSS framework
- [TanStack Query](https://tanstack.com/query) - Data fetching and caching
- [Hono](https://hono.dev) - Lightweight web framework
- [Google Gemini](https://ai.google.dev) - AI assistance
- [Razorpay](https://razorpay.com) - Payment processing
- [Vercel](https://vercel.com) - Deployment platform

Special thanks to all contributors and the open-source community.

---

## 📧 Support & Community

- **Documentation**: You're reading it!
- **Issues**: [GitHub Issues](https://github.com/Happyesss/Fairlx/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Happyesss/Fairlx/discussions)

---

<div align="center">

**Built with ❤️ for modern agile teams**

⭐ Star this repo if you find it useful!

[Back to Top](#-fairlx---enterprise-grade-agile-project-management-platform)

</div>
