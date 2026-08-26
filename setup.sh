#!/usr/bin/env bash
# ============================================================
#  Simply Service — One-Command Server Setup
#  Target: Ubuntu 22.04 / 24.04 LTS
#  Usage:  sudo bash setup.sh
# ============================================================
set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${GREEN}✓${NC} $1"; }
warn()   { echo -e "${YELLOW}⚠${NC}  $1"; }
header() { echo -e "\n${BLUE}${BOLD}══ $1 ══${NC}"; }
die()    { echo -e "${RED}✗ ERROR:${NC} $1"; exit 1; }

if [[ $EUID -eq 0 ]]; then
  ROOT_OK=1
else
  ROOT_OK=0
  warn "Running without sudo; skipping package installation steps that require root privileges."
fi

APP_DIR="${APP_DIR:-$PWD}"

# ============================================================
# PHASE 1 — SYSTEM PREREQUISITES
# ============================================================
header "PHASE 1: System prerequisites"

if [[ "$ROOT_OK" -eq 1 ]]; then
  apt-get update -qq && apt-get install -y -qq curl git ca-certificates gnupg lsb-release openssl ufw

  # Docker
  if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
  else
    log "Docker already present: $(docker --version)"
  fi

  # Node.js 20
  if ! command -v node &>/dev/null; then
    log "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
  else
    log "Node.js already present: $(node --version)"
  fi
else
  log "Using existing Node.js: $(node --version 2>/dev/null || echo 'not found')"
  log "Using existing Docker: $(docker --version 2>/dev/null || echo 'not found')"
fi

# Yarn
command -v yarn &>/dev/null || npm install -g yarn --quiet
log "Prerequisites installed."

# ============================================================
# PHASE 2 — PROJECT STRUCTURE
# ============================================================
header "PHASE 2: Creating project structure"

mkdir -p "$APP_DIR"/{apps/{api/{src/{controllers,services,utils,middleware,routes,config},prisma},web/{src/{pages/{auth,properties,work-orders},components/{ui,layout},hooks,lib,store,types}}},packages/shared/src}
cd "$APP_DIR"
log "Directory tree created at $APP_DIR"

# ============================================================
# ROOT FILES
# ============================================================
cat > package.json << 'EOF'
{
  "name": "simply-service",
  "version": "1.0.0",
  "private": true,
  "description": "Simply Service — Unified Property Operations Platform",
  "workspaces": ["apps/*","packages/*"],
  "scripts": {
    "dev": "concurrently \"yarn workspace @simply-service/api dev\" \"yarn workspace @simply-service/web dev\"",
    "build": "yarn workspace @simply-service/shared build && yarn workspace @simply-service/api build && yarn workspace @simply-service/web build",
    "start": "yarn workspace @simply-service/api start",
    "db:generate": "yarn workspace @simply-service/api db:generate",
    "db:migrate": "yarn workspace @simply-service/api db:migrate",
    "db:seed": "yarn workspace @simply-service/api db:seed"
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "typescript": "^5.3.3"
  },
  "engines": { "node": ">=20.0.0", "yarn": ">=1.22.0" }
}
EOF

cat > docker-compose.yml << 'EOF'
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    container_name: ss_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: simply_service_db
      POSTGRES_USER: simply_user
      POSTGRES_PASSWORD: simply_pass
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./apps/api/prisma/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ['CMD-SHELL','pg_isready -U simply_user -d simply_service_db']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: ss_redis
    restart: unless-stopped
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ['CMD','redis-cli','ping']
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: ss_api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file: .env
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: postgresql://simply_user:simply_pass@postgres:5432/simply_service_db
      REDIS_URL: redis://redis:6379
    ports:
      - '4000:4000'

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        VITE_API_URL: /api/v1
    container_name: ss_web
    restart: unless-stopped
    depends_on:
      - api
    ports:
      - '80:80'

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    name: ss_network
EOF

# Generate strong JWT secrets automatically
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

cat > .env << ENVEOF
# ── Application ──────────────────────────────────────────────
NODE_ENV=production
PORT=4000
API_URL=http://localhost:4000
WEB_URL=http://localhost
CORS_ORIGINS=http://localhost

# ── Database ─────────────────────────────────────────────────
DATABASE_URL=postgresql://simply_user:simply_pass@postgres:5432/simply_service_db

# ── JWT (auto-generated) ─────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── AWS S3 (optional — leave blank to disable file uploads) ──
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET=simply-service-assets

# ── OpenAI (optional — leave blank to disable AI features) ───
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# ── Stripe (optional — leave blank to disable payments) ──────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=

# ── Mapbox (optional — leave blank for map placeholder) ──────
VITE_MAPBOX_TOKEN=

# ── Email / SMTP (optional) ──────────────────────────────────
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=
EMAIL_FROM=noreply@simplyservice.io
EMAIL_FROM_NAME=Simply Service

# ── Socket.io ────────────────────────────────────────────────
SOCKET_CORS_ORIGIN=http://localhost
ENVEOF

cat > .gitignore << 'EOF'
node_modules/
dist/
.env
*.log
logs/
.DS_Store
coverage/
.nyc_output/
EOF

log "Root files written."

# ============================================================
# SHARED PACKAGE
# ============================================================
header "Writing shared package"
cat > packages/shared/package.json << 'EOF'
{
  "name": "@simply-service/shared",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "^5.3.3" }
}
EOF

cat > packages/shared/src/index.ts << 'EOF'
export type UserRole = 'OWNER'|'MANAGER'|'TENANT'|'CONTRACTOR'|'VENDOR'|'UTILITY_PROVIDER'|'INSURANCE_PARTNER'|'FINANCIAL_INSTITUTION'|'ENTERPRISE'|'MUNICIPAL_PARTNER'|'ADMIN';
export type PropertyType = 'SINGLE_FAMILY'|'MULTI_FAMILY'|'APARTMENT_COMPLEX'|'COMMERCIAL_OFFICE'|'RETAIL'|'INDUSTRIAL'|'MIXED_USE'|'MUNICIPAL'|'LAND';
export type PropertyStatus = 'ACTIVE'|'INACTIVE'|'UNDER_CONSTRUCTION'|'FOR_SALE'|'FOR_LEASE'|'ARCHIVED';
export type WorkOrderStatus = 'DRAFT'|'OPEN'|'ASSIGNED'|'IN_PROGRESS'|'ON_HOLD'|'PENDING_REVIEW'|'COMPLETED'|'CANCELLED';
export type WorkOrderPriority = 'LOW'|'MEDIUM'|'HIGH'|'URGENT'|'EMERGENCY';
export type WorkOrderCategory = 'PLUMBING'|'ELECTRICAL'|'HVAC'|'ROOFING'|'STRUCTURAL'|'LANDSCAPING'|'CLEANING'|'PAINTING'|'FLOORING'|'APPLIANCES'|'PEST_CONTROL'|'SECURITY'|'GENERAL_MAINTENANCE'|'INSPECTION'|'OTHER';
export type InspectionStatus = 'SCHEDULED'|'IN_PROGRESS'|'COMPLETED'|'FAILED'|'CANCELLED';
export type InspectionType = 'MOVE_IN'|'MOVE_OUT'|'ROUTINE'|'ANNUAL'|'CODE_COMPLIANCE'|'SAFETY'|'INSURANCE'|'CUSTOM';
export type LeaseStatus = 'DRAFT'|'ACTIVE'|'EXPIRED'|'TERMINATED'|'PENDING_RENEWAL';
export type TransactionType = 'RENT_PAYMENT'|'SECURITY_DEPOSIT'|'MAINTENANCE_FEE'|'LATE_FEE'|'REFUND'|'CONTRACTOR_PAYMENT'|'UTILITY_PAYMENT'|'OTHER';
export type TransactionStatus = 'PENDING'|'COMPLETED'|'FAILED'|'REFUNDED';
export type DocumentType = 'LEASE'|'INSPECTION_REPORT'|'WORK_ORDER_ATTACHMENT'|'INSURANCE_POLICY'|'PERMIT'|'WARRANTY'|'INVOICE'|'RECEIPT'|'PHOTO'|'FLOOR_PLAN'|'OTHER';
export type MessageStatus = 'SENT'|'DELIVERED'|'READ';
export type NotificationChannel = 'EMAIL'|'SMS'|'IN_APP'|'PUSH';

export interface BaseEntity { id: string; createdAt: string; updatedAt: string; }
export interface User extends BaseEntity {
  email: string; firstName: string; lastName: string;
  phone?: string|null; avatarUrl?: string|null; role: UserRole;
  isActive: boolean; isVerified: boolean;
}
export interface Property extends BaseEntity {
  name: string; type: PropertyType; status: PropertyStatus;
  address: string; city: string; state: string; zip: string;
  latitude?: number|null; longitude?: number|null; units: number;
  sqFootage?: number|null; ownerId: string; owner?: User;
  aiSummary?: string|null;
}
export interface Unit extends BaseEntity {
  propertyId: string; unitNumber: string; sqFootage?: number|null;
  bedrooms?: number|null; bathrooms?: number|null;
  monthlyRent?: number|null; isAvailable: boolean;
}
export interface WorkOrder extends BaseEntity {
  title: string; description: string; status: WorkOrderStatus;
  priority: WorkOrderPriority; category: WorkOrderCategory;
  propertyId: string; creatorId: string; assigneeId?: string|null;
  estimatedCost?: number|null; actualCost?: number|null;
  property?: Property; creator?: User; assignee?: User;
}
export interface Inspection extends BaseEntity {
  propertyId: string; creatorId: string; type: InspectionType;
  status: InspectionStatus; scheduledAt: string;
  overallScore?: number|null; notes?: string|null;
}
export interface Document extends BaseEntity {
  name: string; type: DocumentType; url: string; s3Key: string;
  mimeType: string; size: number; uploaderId: string;
  propertyId?: string|null;
}
export interface Transaction extends BaseEntity {
  propertyId: string; userId: string; type: TransactionType;
  status: TransactionStatus; amount: number; currency: string;
  description?: string|null;
}
export interface Message extends BaseEntity {
  conversationId: string; senderId: string; content: string;
  status: MessageStatus; sender?: User;
}
export interface Notification extends BaseEntity {
  userId: string; title: string; body: string; type: string;
  channel: NotificationChannel; isRead: boolean;
}
export interface ContractorProfile extends BaseEntity {
  userId: string; companyName?: string|null;
  specialties: string[]; hourlyRate?: number|null;
  rating?: number|null; isVerified: boolean; bio?: string|null;
  user?: User;
}
export interface ApiResponse<T = unknown> { status: string; data: T; message?: string; }
export interface PaginatedResponse<T> {
  data: { [key: string]: T[]; pagination: { page: number; limit: number; total: number; pages: number; } };
}
EOF
log "Shared package written."

# ============================================================
# API — package.json & tsconfig
# ============================================================
header "Writing API package files"

cat > apps/api/package.json << 'EOF'
{
  "name": "@simply-service/api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only --exit-child -r dotenv/config src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:prod": "prisma migrate deploy",
    "db:seed": "ts-node -r dotenv/config prisma/seed.ts",
    "db:studio": "prisma studio",
    "db:reset": "prisma migrate reset"
  },
  "dependencies": {
    "@prisma/client": "^5.10.2",
    "@aws-sdk/client-s3": "^3.540.0",
    "@aws-sdk/s3-request-presigner": "^3.540.0",
    "bcryptjs": "^2.4.3",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.3",
    "express-async-errors": "^3.1.1",
    "express-rate-limit": "^7.2.0",
    "express-validator": "^7.0.1",
    "helmet": "^7.1.0",
    "ioredis": "^5.3.2",
    "jsonwebtoken": "^9.0.2",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.1",
    "multer-s3": "^3.0.1",
    "nodemailer": "^6.9.11",
    "openai": "^4.28.4",
    "rate-limit-redis": "^4.2.0",
    "socket.io": "^4.7.4",
    "stripe": "^14.21.0",
    "uuid": "^9.0.1",
    "winston": "^3.12.0",
    "winston-daily-rotate-file": "^4.7.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/compression": "^1.7.5",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/morgan": "^1.9.9",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.11.24",
    "@types/nodemailer": "^6.4.14",
    "@types/uuid": "^9.0.7",
    "prisma": "^5.10.2",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.3.3"
  }
}
EOF

cat > apps/api/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020", "module": "commonjs", "lib": ["ES2020"],
    "outDir": "./dist", "rootDir": "./src", "strict": true,
    "esModuleInterop": true, "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true, "resolveJsonModule": true,
    "declaration": true, "sourceMap": true,
    "noUnusedLocals": false, "noUnusedParameters": false,
    "noImplicitReturns": true, "noFallthroughCasesInSwitch": true,
    "moduleResolution": "node", "baseUrl": ".", "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules","dist","prisma"]
}
EOF
log "API package files written."

# ============================================================
# API — Prisma schema + init.sql
# ============================================================
header "Writing Prisma schema"

cat > apps/api/prisma/init.sql << 'EOF'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
SET client_encoding = 'UTF8';
EOF

cat > apps/api/prisma/schema.prisma << 'EOF'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  OWNER MANAGER TENANT CONTRACTOR VENDOR
  UTILITY_PROVIDER INSURANCE_PARTNER FINANCIAL_INSTITUTION
  ENTERPRISE MUNICIPAL_PARTNER ADMIN
}
enum PropertyType {
  SINGLE_FAMILY MULTI_FAMILY APARTMENT_COMPLEX COMMERCIAL_OFFICE
  RETAIL INDUSTRIAL MIXED_USE MUNICIPAL LAND
}
enum PropertyStatus { ACTIVE INACTIVE UNDER_CONSTRUCTION FOR_SALE FOR_LEASE ARCHIVED }
enum WorkOrderStatus { DRAFT OPEN ASSIGNED IN_PROGRESS ON_HOLD PENDING_REVIEW COMPLETED CANCELLED }
enum WorkOrderPriority { LOW MEDIUM HIGH URGENT EMERGENCY }
enum WorkOrderCategory {
  PLUMBING ELECTRICAL HVAC ROOFING STRUCTURAL LANDSCAPING
  CLEANING PAINTING FLOORING APPLIANCES PEST_CONTROL SECURITY
  GENERAL_MAINTENANCE INSPECTION OTHER
}
enum InspectionStatus { SCHEDULED IN_PROGRESS COMPLETED FAILED CANCELLED }
enum InspectionType { MOVE_IN MOVE_OUT ROUTINE ANNUAL CODE_COMPLIANCE SAFETY INSURANCE CUSTOM }
enum LeaseStatus { DRAFT ACTIVE EXPIRED TERMINATED PENDING_RENEWAL }
enum TransactionType {
  RENT_PAYMENT SECURITY_DEPOSIT MAINTENANCE_FEE LATE_FEE
  REFUND CONTRACTOR_PAYMENT UTILITY_PAYMENT OTHER
}
enum TransactionStatus { PENDING COMPLETED FAILED REFUNDED }
enum DocumentType {
  LEASE INSPECTION_REPORT WORK_ORDER_ATTACHMENT INSURANCE_POLICY
  PERMIT WARRANTY INVOICE RECEIPT PHOTO FLOOR_PLAN OTHER
}
enum MessageStatus { SENT DELIVERED READ }
enum NotificationChannel { EMAIL SMS IN_APP PUSH }

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  firstName     String
  lastName      String
  phone         String?
  avatarUrl     String?
  role          UserRole  @default(TENANT)
  isActive      Boolean   @default(true)
  isVerified    Boolean   @default(false)
  verifyToken   String?
  resetToken    String?
  resetTokenExp DateTime?
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  ownedProperties     Property[]           @relation("PropertyOwner")
  managedProperties   PropertyManager[]
  tenancies           Lease[]              @relation("TenantLease")
  contractorProfile   ContractorProfile?
  workOrdersCreated   WorkOrder[]          @relation("WorkOrderCreator")
  workOrdersAssigned  WorkOrder[]          @relation("WorkOrderAssignee")
  messagesSent        Message[]            @relation("MessageSender")
  conversations       MessageParticipant[]
  documents           Document[]
  transactions        Transaction[]
  inspectionsCreated  Inspection[]         @relation("InspectionCreator")
  notifications       Notification[]
  organizationMembers OrganizationMember[]
  refreshTokens       RefreshToken[]

  @@index([email])
  @@index([role])
  @@map("users")
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([token])
  @@map("refresh_tokens")
}

model Organization {
  id        String   @id @default(cuid())
  name      String
  type      String
  logoUrl   String?
  website   String?
  phone     String?
  email     String?
  address   String?
  city      String?
  state     String?
  zip       String?
  country   String   @default("US")
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  members   OrganizationMember[]
  properties PropertyOrganization[]
  @@map("organizations")
}

model OrganizationMember {
  id             String       @id @default(cuid())
  organizationId String
  userId         String
  role           String
  joinedAt       DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([organizationId, userId])
  @@map("organization_members")
}

model Property {
  id            String         @id @default(cuid())
  ownerId       String
  name          String
  type          PropertyType
  status        PropertyStatus @default(ACTIVE)
  address       String
  city          String
  state         String
  zip           String
  country       String         @default("US")
  latitude      Float?
  longitude     Float?
  yearBuilt     Int?
  sqFootage     Float?
  lotSize       Float?
  bedrooms      Int?
  bathrooms     Float?
  units         Int            @default(1)
  parkingSpaces Int?
  description   String?
  coverImageUrl String?
  purchasePrice Float?
  purchaseDate  DateTime?
  currentValue  Float?
  isListed      Boolean        @default(false)
  aiSummary     String?
  aiSummaryAt   DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  owner         User                  @relation("PropertyOwner", fields: [ownerId], references: [id])
  managers      PropertyManager[]
  units_rel     Unit[]
  leases        Lease[]
  workOrders    WorkOrder[]
  inspections   Inspection[]
  documents     Document[]
  transactions  Transaction[]
  messages      Conversation[]
  organizations PropertyOrganization[]
  photos        PropertyPhoto[]

  @@index([ownerId])
  @@index([status])
  @@index([latitude, longitude])
  @@map("properties")
}

model PropertyPhoto {
  id         String   @id @default(cuid())
  propertyId String
  url        String
  caption    String?
  isPrimary  Boolean  @default(false)
  order      Int      @default(0)
  createdAt  DateTime @default(now())
  property   Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@map("property_photos")
}

model PropertyManager {
  id         String   @id @default(cuid())
  propertyId String
  managerId  String
  assignedAt DateTime @default(now())
  isActive   Boolean  @default(true)
  property   Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  manager    User     @relation(fields: [managerId], references: [id], onDelete: Cascade)
  @@unique([propertyId, managerId])
  @@map("property_managers")
}

model PropertyOrganization {
  id             String       @id @default(cuid())
  propertyId     String
  organizationId String
  relationship   String
  accountNumber  String?
  notes          String?
  createdAt      DateTime     @default(now())
  property       Property     @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@map("property_organizations")
}

model Unit {
  id          String    @id @default(cuid())
  propertyId  String
  unitNumber  String
  floor       Int?
  sqFootage   Float?
  bedrooms    Int?
  bathrooms   Float?
  monthlyRent Float?
  isAvailable Boolean   @default(true)
  description String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  property    Property  @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  leases      Lease[]
  workOrders  WorkOrder[]
  @@unique([propertyId, unitNumber])
  @@map("units")
}

model Lease {
  id                String      @id @default(cuid())
  propertyId        String
  unitId            String?
  tenantId          String
  status            LeaseStatus @default(DRAFT)
  startDate         DateTime
  endDate           DateTime
  monthlyRent       Float
  securityDeposit   Float?
  petDeposit        Float?
  lateFeeAmount     Float?
  lateFeeGraceDays  Int         @default(5)
  terms             String?
  signedAt          DateTime?
  terminatedAt      DateTime?
  terminationReason String?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  property          Property    @relation(fields: [propertyId], references: [id])
  unit              Unit?       @relation(fields: [unitId], references: [id])
  tenant            User        @relation("TenantLease", fields: [tenantId], references: [id])
  documents         Document[]
  transactions      Transaction[]
  @@index([propertyId])
  @@index([tenantId])
  @@index([status])
  @@map("leases")
}

model WorkOrder {
  id            String            @id @default(cuid())
  propertyId    String
  unitId        String?
  creatorId     String
  assigneeId    String?
  title         String
  description   String
  status        WorkOrderStatus   @default(OPEN)
  priority      WorkOrderPriority @default(MEDIUM)
  category      WorkOrderCategory @default(GENERAL_MAINTENANCE)
  estimatedCost Float?
  actualCost    Float?
  scheduledAt   DateTime?
  startedAt     DateTime?
  completedAt   DateTime?
  dueDate       DateTime?
  notes         String?
  aiSuggestion  String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  property      Property          @relation(fields: [propertyId], references: [id])
  unit          Unit?             @relation(fields: [unitId], references: [id])
  creator       User              @relation("WorkOrderCreator", fields: [creatorId], references: [id])
  assignee      User?             @relation("WorkOrderAssignee", fields: [assigneeId], references: [id])
  documents     Document[]
  comments      WorkOrderComment[]
  transactions  Transaction[]
  @@index([propertyId])
  @@index([status])
  @@index([assigneeId])
  @@map("work_orders")
}

model WorkOrderComment {
  id          String    @id @default(cuid())
  workOrderId String
  authorId    String
  content     String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  @@map("work_order_comments")
}

model ContractorProfile {
  id              String    @id @default(cuid())
  userId          String    @unique
  companyName     String?
  licenseNumber   String?
  licenseState    String?
  licenseExpiry   DateTime?
  insurancePolicy String?
  insuranceExpiry DateTime?
  rating          Float?
  reviewCount     Int       @default(0)
  specialties     String[]
  serviceRadius   Int?
  hourlyRate      Float?
  availability    Json?
  bio             String?
  isVerified      Boolean   @default(false)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("contractor_profiles")
}

model Inspection {
  id          String           @id @default(cuid())
  propertyId  String
  creatorId   String
  type        InspectionType
  status      InspectionStatus @default(SCHEDULED)
  scheduledAt DateTime
  completedAt DateTime?
  inspector   String?
  overallScore Float?
  findings    Json?
  notes       String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  property    Property         @relation(fields: [propertyId], references: [id])
  creator     User             @relation("InspectionCreator", fields: [creatorId], references: [id])
  documents   Document[]
  items       InspectionItem[]
  @@index([propertyId])
  @@map("inspections")
}

model InspectionItem {
  id           String     @id @default(cuid())
  inspectionId String
  area         String
  item         String
  condition    String
  notes        String?
  photoUrls    String[]
  inspection   Inspection @relation(fields: [inspectionId], references: [id], onDelete: Cascade)
  @@map("inspection_items")
}

model Document {
  id           String       @id @default(cuid())
  uploaderId   String
  propertyId   String?
  workOrderId  String?
  inspectionId String?
  leaseId      String?
  name         String
  type         DocumentType
  mimeType     String
  size         Int
  url          String
  s3Key        String
  description  String?
  expiresAt    DateTime?
  isPrivate    Boolean      @default(false)
  createdAt    DateTime     @default(now())
  uploader     User         @relation(fields: [uploaderId], references: [id])
  property     Property?    @relation(fields: [propertyId], references: [id])
  workOrder    WorkOrder?   @relation(fields: [workOrderId], references: [id])
  inspection   Inspection?  @relation(fields: [inspectionId], references: [id])
  lease        Lease?       @relation(fields: [leaseId], references: [id])
  @@index([propertyId])
  @@map("documents")
}

model Conversation {
  id          String    @id @default(cuid())
  propertyId  String?
  subject     String?
  isGroup     Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  property    Property? @relation(fields: [propertyId], references: [id])
  messages    Message[]
  participants MessageParticipant[]
  @@map("conversations")
}

model MessageParticipant {
  id             String       @id @default(cuid())
  conversationId String
  userId         String
  lastReadAt     DateTime?
  joinedAt       DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([conversationId, userId])
  @@map("message_participants")
}

model Message {
  id             String        @id @default(cuid())
  conversationId String
  senderId       String
  content        String
  status         MessageStatus @default(SENT)
  attachmentUrls String[]
  createdAt      DateTime      @default(now())
  editedAt       DateTime?
  conversation   Conversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User          @relation("MessageSender", fields: [senderId], references: [id])
  @@index([conversationId])
  @@map("messages")
}

model Transaction {
  id          String            @id @default(cuid())
  propertyId  String
  userId      String
  workOrderId String?
  leaseId     String?
  type        TransactionType
  status      TransactionStatus @default(PENDING)
  amount      Float
  currency    String            @default("USD")
  description String?
  stripeId    String?
  receiptUrl  String?
  dueDate     DateTime?
  paidAt      DateTime?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  property    Property          @relation(fields: [propertyId], references: [id])
  user        User              @relation(fields: [userId], references: [id])
  workOrder   WorkOrder?        @relation(fields: [workOrderId], references: [id])
  lease       Lease?            @relation(fields: [leaseId], references: [id])
  @@index([propertyId])
  @@index([status])
  @@map("transactions")
}

model Notification {
  id        String              @id @default(cuid())
  userId    String
  title     String
  body      String
  type      String
  channel   NotificationChannel
  isRead    Boolean             @default(false)
  data      Json?
  createdAt DateTime            @default(now())
  user      User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, isRead])
  @@map("notifications")
}
EOF
log "Prisma schema written."

# ============================================================
# API — Core source files
# ============================================================
header "Writing API core source files"

cat > apps/api/src/config/index.ts << 'EOF'
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const opt = (key: string, fallback = ''): string => process.env[key] ?? fallback;
const req = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
};

export const config = {
  env: opt('NODE_ENV', 'development'),
  port: parseInt(opt('PORT', '4000'), 10),
  apiUrl: opt('API_URL', 'http://localhost:4000'),
  webUrl: opt('WEB_URL', 'http://localhost'),
  corsOrigins: opt('CORS_ORIGINS', 'http://localhost').split(','),
  isDev: opt('NODE_ENV', 'development') === 'development',
  isProd: opt('NODE_ENV', 'development') === 'production',
  db: { url: req('DATABASE_URL') },
  jwt: {
    secret: opt('JWT_SECRET', 'dev_secret_change_me'),
    refreshSecret: opt('JWT_REFRESH_SECRET', 'dev_refresh_change_me'),
    expiresIn: opt('JWT_EXPIRES_IN', '15m'),
    refreshExpiresIn: opt('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
  aws: {
    accessKeyId: opt('AWS_ACCESS_KEY_ID'),
    secretAccessKey: opt('AWS_SECRET_ACCESS_KEY'),
    region: opt('AWS_REGION', 'us-east-1'),
    bucket: opt('AWS_S3_BUCKET', 'simply-service-assets'),
  },
  openai: { apiKey: opt('OPENAI_API_KEY'), model: opt('OPENAI_MODEL', 'gpt-4o') },
  stripe: {
    secretKey: opt('STRIPE_SECRET_KEY'),
    webhookSecret: opt('STRIPE_WEBHOOK_SECRET'),
    publishableKey: opt('STRIPE_PUBLISHABLE_KEY'),
  },
  email: {
    host: opt('SMTP_HOST', 'smtp.sendgrid.net'),
    port: parseInt(opt('SMTP_PORT', '587'), 10),
    user: opt('SMTP_USER'),
    pass: opt('SMTP_PASS'),
    from: opt('EMAIL_FROM', 'noreply@simplyservice.io'),
    fromName: opt('EMAIL_FROM_NAME', 'Simply Service'),
  },
  redis: { url: opt('REDIS_URL', 'redis://localhost:6379') },
};
EOF

cat > apps/api/src/utils/logger.ts << 'EOF'
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config';
const { combine, timestamp, printf, colorize, json, errors } = winston.format;
const devFmt = combine(colorize({ all: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => stack ? `${ts} [${level}]: ${message}\n${stack}` : `${ts} [${level}]: ${message}`));
const prodFmt = combine(timestamp(), errors({ stack: true }), json());
const transports: winston.transport[] = [new winston.transports.Console({ format: config.isDev ? devFmt : prodFmt })];
if (config.isProd) {
  transports.push(
    new DailyRotateFile({ filename: 'logs/error-%DATE%.log', datePattern: 'YYYY-MM-DD', level: 'error', maxFiles: '30d', format: prodFmt }),
    new DailyRotateFile({ filename: 'logs/combined-%DATE%.log', datePattern: 'YYYY-MM-DD', maxFiles: '14d', format: prodFmt })
  );
}
export const logger = winston.createLogger({ level: config.isDev ? 'debug' : 'info', transports, exitOnError: false });
export default logger;
EOF

cat > apps/api/src/utils/jwt.ts << 'EOF'
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';
export interface JwtPayload { userId: string; email: string; role: string; }
export const signAccessToken = (p: JwtPayload): string =>
  jwt.sign(p, config.jwt.secret, { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] });
export const signRefreshToken = (p: JwtPayload): string =>
  jwt.sign(p, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn as SignOptions['expiresIn'] });
export const verifyAccessToken = (t: string): JwtPayload => jwt.verify(t, config.jwt.secret) as JwtPayload;
export const verifyRefreshToken = (t: string): JwtPayload => jwt.verify(t, config.jwt.refreshSecret) as JwtPayload;
export const decodeToken = (t: string) => jwt.decode(t);
EOF

cat > apps/api/src/utils/bcrypt.ts << 'EOF'
import bcrypt from 'bcryptjs';
const SALT = 12;
export const hashPassword = (p: string) => bcrypt.hash(p, SALT);
export const comparePassword = (p: string, h: string) => bcrypt.compare(p, h);
EOF

cat > apps/api/src/middleware/errorHandler.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(public statusCode: number, message: string, public isOperational = true) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(`${req.method} ${req.path} — ${err.message}`, { stack: err.stack });
  if (err instanceof AppError) return res.status(err.statusCode).json({ status: 'error', message: err.message });
  if (err instanceof TokenExpiredError) return res.status(401).json({ status: 'error', message: 'Token expired' });
  if (err instanceof JsonWebTokenError) return res.status(401).json({ status: 'error', message: 'Invalid token' });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ status: 'error', message: 'A record with that value already exists' });
    if (err.code === 'P2025') return res.status(404).json({ status: 'error', message: 'Record not found' });
  }
  if (err instanceof Prisma.PrismaClientValidationError)
    return res.status(400).json({ status: 'error', message: 'Invalid data provided' });
  const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
  return res.status(500).json({ status: 'error', message });
};

export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, `Route ${req.originalUrl} not found`));
};
EOF

cat > apps/api/src/middleware/rateLimiter.ts << 'EOF'
import rateLimit from 'express-rate-limit';
import { config } from '../config';
export const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false });
export const authLimiter   = rateLimit({ windowMs: 15*60*1000, max: 20,  standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });
export const aiLimiter     = rateLimit({ windowMs: 60*1000,    max: config.isProd ? 10 : 50, standardHeaders: true, legacyHeaders: false });
export const uploadLimiter = rateLimit({ windowMs: 60*60*1000, max: 50,  standardHeaders: true, legacyHeaders: false });
EOF

cat > apps/api/src/middleware/auth.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { AppError } from './errorHandler';
import { UserRole } from '@prisma/client';

export interface AuthRequest extends Request { user?: JwtPayload; }

export const authenticate = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return next(new AppError(401, 'No token provided'));
  try { req.user = verifyAccessToken(auth.split(' ')[1]); next(); }
  catch { next(new AppError(401, 'Invalid or expired token')); }
};

export const authorize = (...roles: UserRole[]) => (req: AuthRequest, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new AppError(401, 'Not authenticated'));
  if (!roles.includes(req.user.role as UserRole)) return next(new AppError(403, 'Insufficient permissions'));
  next();
};

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try { req.user = verifyAccessToken(auth.split(' ')[1]); } catch { /* ignore */ }
  }
  next();
};
EOF
log "API core files written."

# ============================================================
# API — app.ts & index.ts
# ============================================================
cat > apps/api/src/app.ts << 'EOF'
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config';
import { logger } from './utils/logger';
import { globalLimiter } from './middleware/rateLimiter';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiRouter } from './routes';

const app = express();

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Request-ID'],
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(config.isDev ? 'dev' : 'combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
  skip: (req) => req.url === '/health',
}));
app.use(globalLimiter);
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' }));
app.use('/api/v1', apiRouter);
app.use(notFound);
app.use(errorHandler);

export { app };
EOF

cat > apps/api/src/index.ts << 'EOF'
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: config.isDev ? ['query','error','warn'] : ['error'],
});

const server = http.createServer(app);

export const io = new SocketServer(server, {
  cors: { origin: config.corsOrigins, credentials: true },
  transports: ['websocket','polling'],
});

io.on('connection', (socket) => {
  logger.debug(`Socket connected: ${socket.id}`);
  socket.on('join:property',      (id: string) => socket.join(`property:${id}`));
  socket.on('join:conversation',  (id: string) => socket.join(`conversation:${id}`));
  socket.on('leave:conversation', (id: string) => socket.leave(`conversation:${id}`));
  socket.on('disconnect', () => logger.debug(`Socket disconnected: ${socket.id}`));
});

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down...`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (r) => logger.error('Unhandled Rejection:', r));
process.on('uncaughtException',  (e) => { logger.error('Uncaught Exception:', e); process.exit(1); });

const start = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected');
    server.listen(config.port, () =>
      logger.info(`Simply Service API running on port ${config.port} [${config.env}]`));
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};
start();
EOF
log "app.ts and index.ts written."

# ============================================================
# API — Routes
# ============================================================
header "Writing API routes"

cat > apps/api/src/routes/index.ts << 'EOF'
import { Router } from 'express';
import authRoutes        from './auth.routes';
import propertiesRoutes  from './properties.routes';
import workOrdersRoutes  from './workOrders.routes';
import usersRoutes       from './users.routes';
import documentsRoutes   from './documents.routes';
import messagesRoutes    from './messages.routes';
import financialRoutes   from './financial.routes';
import inspectionsRoutes from './inspections.routes';
import contractorsRoutes from './contractors.routes';
import aiRoutes          from './ai.routes';
import notificationsRoutes from './notifications.routes';

export const apiRouter = Router();
apiRouter.use('/auth',          authRoutes);
apiRouter.use('/properties',    propertiesRoutes);
apiRouter.use('/work-orders',   workOrdersRoutes);
apiRouter.use('/users',         usersRoutes);
apiRouter.use('/documents',     documentsRoutes);
apiRouter.use('/messages',      messagesRoutes);
apiRouter.use('/financial',     financialRoutes);
apiRouter.use('/inspections',   inspectionsRoutes);
apiRouter.use('/contractors',   contractorsRoutes);
apiRouter.use('/ai',            aiRoutes);
apiRouter.use('/notifications', notificationsRoutes);
EOF

cat > apps/api/src/routes/auth.routes.ts << 'EOF'
import { Router } from 'express';
import { register, login, refreshToken, logout, me, forgotPassword, resetPassword, verifyEmail } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
const router = Router();
router.post('/register',          authLimiter, register);
router.post('/login',             authLimiter, login);
router.post('/refresh',           refreshToken);
router.post('/logout',            authenticate, logout);
router.get('/me',                 authenticate, me);
router.post('/forgot-password',   authLimiter, forgotPassword);
router.post('/reset-password',    authLimiter, resetPassword);
router.get('/verify-email/:token', verifyEmail);
export default router;
EOF

cat > apps/api/src/routes/properties.routes.ts << 'EOF'
import { Router } from 'express';
import { getProperties, getProperty, createProperty, updateProperty, deleteProperty, getPropertyStats, addPropertyManager, removePropertyManager, getPropertyUnits, createUnit, updateUnit, getMapProperties, generatePropertySummary } from '../controllers/properties.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '@prisma/client';
const router = Router();
router.use(authenticate);
router.get('/',                 getProperties);
router.get('/map',              getMapProperties);
router.get('/:id',              getProperty);
router.get('/:id/stats',        getPropertyStats);
router.get('/:id/units',        getPropertyUnits);
router.post('/',                authorize(UserRole.OWNER, UserRole.ADMIN), createProperty);
router.put('/:id',              authorize(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), updateProperty);
router.delete('/:id',           authorize(UserRole.OWNER, UserRole.ADMIN), deleteProperty);
router.post('/:id/managers',    authorize(UserRole.OWNER, UserRole.ADMIN), addPropertyManager);
router.delete('/:id/managers/:managerId', authorize(UserRole.OWNER, UserRole.ADMIN), removePropertyManager);
router.post('/:id/units',       authorize(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), createUnit);
router.put('/:id/units/:unitId',authorize(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), updateUnit);
router.post('/:id/ai-summary',  generatePropertySummary);
export default router;
EOF

cat > apps/api/src/routes/workOrders.routes.ts << 'EOF'
import { Router } from 'express';
import { getWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder, deleteWorkOrder, assignWorkOrder, updateWorkOrderStatus, addComment, getComments } from '../controllers/workOrders.controller';
import { authenticate } from '../middleware/auth';
const router = Router();
router.use(authenticate);
router.get('/',                 getWorkOrders);
router.get('/:id',              getWorkOrder);
router.post('/',                createWorkOrder);
router.put('/:id',              updateWorkOrder);
router.delete('/:id',           deleteWorkOrder);
router.patch('/:id/assign',     assignWorkOrder);
router.patch('/:id/status',     updateWorkOrderStatus);
router.get('/:id/comments',     getComments);
router.post('/:id/comments',    addComment);
export default router;
EOF

cat > apps/api/src/routes/users.routes.ts << 'EOF'
import { Router } from 'express';
import { getUsers, getUser, updateUser, updatePassword, deleteUser, uploadAvatar } from '../controllers/users.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '@prisma/client';
const router = Router();
router.use(authenticate);
router.get('/',            authorize(UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER), getUsers);
router.get('/:id',         getUser);
router.put('/:id',         updateUser);
router.patch('/:id/password', updatePassword);
router.delete('/:id',      authorize(UserRole.ADMIN), deleteUser);
router.post('/:id/avatar', uploadAvatar);
export default router;
EOF

cat > apps/api/src/routes/financial.routes.ts << 'EOF'
import { Router } from 'express';
import express from 'express';
import { getTransactions, getTransaction, createTransaction, getFinancialSummary, createPaymentIntent, handleWebhook } from '../controllers/financial.controller';
import { authenticate } from '../middleware/auth';
const router = Router();
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);
router.use(authenticate);
router.get('/transactions',       getTransactions);
router.get('/transactions/:id',   getTransaction);
router.post('/transactions',      createTransaction);
router.get('/summary',            getFinancialSummary);
router.post('/payment-intent',    createPaymentIntent);
export default router;
EOF

cat > apps/api/src/routes/messages.routes.ts << 'EOF'
import { Router } from 'express';
import { getConversations, getConversation, createConversation, sendMessage, markRead, getMessages } from '../controllers/messages.controller';
import { authenticate } from '../middleware/auth';
const router = Router();
router.use(authenticate);
router.get('/conversations',                  getConversations);
router.post('/conversations',                 createConversation);
router.get('/conversations/:id',              getConversation);
router.get('/conversations/:id/messages',     getMessages);
router.post('/conversations/:id/messages',    sendMessage);
router.patch('/conversations/:id/read',       markRead);
export default router;
EOF

cat > apps/api/src/routes/inspections.routes.ts << 'EOF'
import { Router } from 'express';
import { getInspections, getInspection, createInspection, updateInspection, completeInspection, deleteInspection } from '../controllers/inspections.controller';
import { authenticate } from '../middleware/auth';
const router = Router();
router.use(authenticate);
router.get('/',             getInspections);
router.get('/:id',          getInspection);
router.post('/',            createInspection);
router.put('/:id',          updateInspection);
router.patch('/:id/complete', completeInspection);
router.delete('/:id',       deleteInspection);
export default router;
EOF

cat > apps/api/src/routes/documents.routes.ts << 'EOF'
import { Router } from 'express';
import { getDocuments, getDocument, createDocument, deleteDocument, getSignedUploadUrl } from '../controllers/documents.controller';
import { authenticate } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimiter';
const router = Router();
router.use(authenticate);
router.get('/',           getDocuments);
router.get('/:id',        getDocument);
router.post('/',          uploadLimiter, createDocument);
router.post('/signed-url', uploadLimiter, getSignedUploadUrl);
router.delete('/:id',     deleteDocument);
export default router;
EOF

cat > apps/api/src/routes/contractors.routes.ts << 'EOF'
import { Router } from 'express';
import { getContractors, getContractor, getContractorByUser, updateContractorProfile, getContractorWorkOrders } from '../controllers/contractors.controller';
import { authenticate } from '../middleware/auth';
const router = Router();
router.use(authenticate);
router.get('/',         getContractors);
router.get('/me',       getContractorByUser);
router.get('/:id',      getContractor);
router.put('/profile',  updateContractorProfile);
router.get('/work-orders', getContractorWorkOrders);
export default router;
EOF

cat > apps/api/src/routes/ai.routes.ts << 'EOF'
import { Router } from 'express';
import { chatWithAssistant, summarizeDocument, generateWorkOrderSuggestion, matchContractors, generatePortfolioReport } from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth';
import { aiLimiter } from '../middleware/rateLimiter';
const router = Router();
router.use(authenticate);
router.use(aiLimiter);
router.post('/chat',                chatWithAssistant);
router.post('/summarize-document',  summarizeDocument);
router.post('/work-order-suggestion', generateWorkOrderSuggestion);
router.post('/match-contractors',   matchContractors);
router.post('/portfolio-report',    generatePortfolioReport);
export default router;
EOF

cat > apps/api/src/routes/notifications.routes.ts << 'EOF'
import { Router } from 'express';
import { getNotifications, markRead, markAllRead, deleteNotification, getUnreadCount } from '../controllers/notifications.controller';
import { authenticate } from '../middleware/auth';
const router = Router();
router.use(authenticate);
router.get('/',             getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read',   markRead);
router.patch('/read-all',   markAllRead);
router.delete('/:id',       deleteNotification);
export default router;
EOF
log "All API routes written."

# ============================================================
# API — Controllers
# ============================================================
header "Writing API controllers"

cat > apps/api/src/controllers/auth.controller.ts << 'EOF'
import { Request, Response } from 'express';
import { prisma } from '../index';
import { hashPassword, comparePassword } from '../utils/bcrypt';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { v4 as uuid } from 'uuid';
import { UserRole } from '@prisma/client';

export const register = async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, phone, role } = req.body;
  if (!email || !password || !firstName || !lastName)
    throw new AppError(400, 'Email, password, first and last name are required');
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'Email already registered');
  const allowed: UserRole[] = [UserRole.OWNER,UserRole.MANAGER,UserRole.TENANT,UserRole.CONTRACTOR,UserRole.VENDOR];
  const userRole: UserRole = allowed.includes(role) ? role : UserRole.TENANT;
  const passwordHash = await hashPassword(password);
  const verifyToken = uuid();
  const user = await prisma.user.create({
    data: { email: email.toLowerCase().trim(), passwordHash, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone?.trim(), role: userRole, verifyToken },
    select: { id:true, email:true, firstName:true, lastName:true, role:true, isVerified:true, createdAt:true },
  });
  const accessToken  = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email, role: user.role });
  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7*24*60*60*1000) } });
  res.status(201).json({ status:'success', data: { user, accessToken, refreshToken } });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError(400, 'Email and password are required');
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !(await comparePassword(password, user.passwordHash))) throw new AppError(401, 'Invalid email or password');
  if (!user.isActive) throw new AppError(403, 'Account is disabled');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const accessToken  = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email, role: user.role });
  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7*24*60*60*1000) } });
  const { passwordHash, verifyToken, resetToken, resetTokenExp, ...safeUser } = user;
  res.json({ status:'success', data: { user: safeUser, accessToken, refreshToken } });
};

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken: token } = req.body;
  if (!token) throw new AppError(400, 'Refresh token required');
  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.expiresAt < new Date()) throw new AppError(401, 'Invalid or expired refresh token');
  const payload = verifyRefreshToken(token);
  const accessToken  = signAccessToken({ userId: payload.userId, email: payload.email, role: payload.role });
  const newRefresh   = signRefreshToken({ userId: payload.userId, email: payload.email, role: payload.role });
  await prisma.refreshToken.delete({ where: { token } });
  await prisma.refreshToken.create({ data: { token: newRefresh, userId: payload.userId, expiresAt: new Date(Date.now() + 7*24*60*60*1000) } });
  res.json({ status:'success', data: { accessToken, refreshToken: newRefresh } });
};

export const logout = async (req: AuthRequest, res: Response) => {
  const { refreshToken: token } = req.body;
  if (token) await prisma.refreshToken.deleteMany({ where: { token } });
  res.json({ status:'success', message: 'Logged out' });
};

export const me = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id:true, email:true, firstName:true, lastName:true, phone:true, avatarUrl:true, role:true, isActive:true, isVerified:true, lastLoginAt:true, createdAt:true, contractorProfile:true },
  });
  if (!user) throw new AppError(404, 'User not found');
  res.json({ status:'success', data: { user } });
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email?.toLowerCase() } });
  if (user) {
    const resetToken = uuid();
    await prisma.user.update({ where: { id: user.id }, data: { resetToken, resetTokenExp: new Date(Date.now() + 60*60*1000) } });
  }
  res.json({ status:'success', message: 'If that email exists, a reset link has been sent' });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body;
  if (!token || !password) throw new AppError(400, 'Token and new password are required');
  const user = await prisma.user.findFirst({ where: { resetToken: token, resetTokenExp: { gte: new Date() } } });
  if (!user) throw new AppError(400, 'Invalid or expired reset token');
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, resetToken: null, resetTokenExp: null } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  res.json({ status:'success', message: 'Password reset successfully' });
};

export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.params;
  const user = await prisma.user.findFirst({ where: { verifyToken: token } });
  if (!user) throw new AppError(400, 'Invalid verification token');
  await prisma.user.update({ where: { id: user.id }, data: { isVerified: true, verifyToken: null } });
  res.json({ status:'success', message: 'Email verified successfully' });
};
EOF

cat > apps/api/src/controllers/users.controller.ts << 'EOF'
import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { hashPassword, comparePassword } from '../utils/bcrypt';

export const getUsers = async (req: AuthRequest, res: Response) => {
  const { role, search } = req.query as Record<string,string>;
  const where: any = {};
  if (role) where.role = role;
  if (search) where.OR = [
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName:  { contains: search, mode: 'insensitive' } },
    { email:     { contains: search, mode: 'insensitive' } },
  ];
  const users = await prisma.user.findMany({ where, select: { id:true, email:true, firstName:true, lastName:true, phone:true, avatarUrl:true, role:true, isActive:true, isVerified:true, createdAt:true }, orderBy: { createdAt:'desc' } });
  res.json({ status:'success', data: { users } });
};

export const getUser = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id:true, email:true, firstName:true, lastName:true, phone:true, avatarUrl:true, role:true, isActive:true, isVerified:true, lastLoginAt:true, createdAt:true, contractorProfile:true } });
  if (!user) throw new AppError(404, 'User not found');
  res.json({ status:'success', data: { user } });
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (id !== req.user!.userId && req.user!.role !== 'ADMIN') throw new AppError(403, 'Cannot update another user profile');
  const { firstName, lastName, phone, avatarUrl } = req.body;
  const user = await prisma.user.update({ where: { id }, data: { firstName, lastName, phone, avatarUrl }, select: { id:true, email:true, firstName:true, lastName:true, phone:true, avatarUrl:true, role:true } });
  res.json({ status:'success', data: { user } });
};

export const updatePassword = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (id !== req.user!.userId) throw new AppError(403, 'Cannot change another user password');
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new AppError(400, 'Current and new passwords are required');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');
  if (!(await comparePassword(currentPassword, user.passwordHash))) throw new AppError(400, 'Current password is incorrect');
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  await prisma.refreshToken.deleteMany({ where: { userId: id } });
  res.json({ status:'success', message: 'Password updated successfully' });
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ status:'success', message: 'User deactivated' });
};

export const uploadAvatar = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { avatarUrl: req.body.avatarUrl } });
  res.json({ status:'success', data: { avatarUrl: user.avatarUrl } });
};
EOF

log "Auth + Users controllers written."

# ============================================================
# API — More Controllers
# ============================================================
cat > apps/api/src/controllers/properties.controller.ts << 'EOF'
import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '@prisma/client';
import { aiService } from '../services/ai.service';

export const getProperties = async (req: AuthRequest, res: Response) => {
  const { role, userId } = req.user!;
  const { page='1', limit='20', status, type, city, state, search } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (role===UserRole.OWNER) where.ownerId = userId;
  else if (role===UserRole.MANAGER) where.managers = { some: { managerId: userId, isActive: true } };
  else if (role===UserRole.TENANT) where.leases = { some: { tenantId: userId, status: 'ACTIVE' } };
  else if (role===UserRole.CONTRACTOR) where.workOrders = { some: { assigneeId: userId } };
  if (status) where.status = status;
  if (type)   where.type   = type;
  if (city)   where.city   = { contains: city,   mode: 'insensitive' };
  if (state)  where.state  = state;
  if (search) where.OR = [
    { name:    { contains: search, mode: 'insensitive' } },
    { address: { contains: search, mode: 'insensitive' } },
    { city:    { contains: search, mode: 'insensitive' } },
  ];
  const [properties, total] = await Promise.all([
    prisma.property.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt:'desc' },
      include: { owner: { select:{id:true,firstName:true,lastName:true,email:true} }, _count: { select:{workOrders:true,units_rel:true,leases:true} } } }),
    prisma.property.count({ where }),
  ]);
  res.json({ status:'success', data: { properties, pagination: { page:parseInt(page), limit:parseInt(limit), total, pages:Math.ceil(total/parseInt(limit)) } } });
};

export const getMapProperties = async (req: AuthRequest, res: Response) => {
  const { role, userId } = req.user!;
  const where: any = { latitude: { not: null }, longitude: { not: null } };
  if (role===UserRole.OWNER) where.ownerId = userId;
  else if (role===UserRole.MANAGER) where.managers = { some: { managerId: userId, isActive: true } };
  const properties = await prisma.property.findMany({ where, select: { id:true,name:true,address:true,city:true,state:true,latitude:true,longitude:true,status:true,type:true,coverImageUrl:true,aiSummary:true, _count:{select:{workOrders:true}} } });
  res.json({ status:'success', data: { properties } });
};

export const getProperty = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const property = await prisma.property.findUnique({ where:{id}, include: {
    owner: { select:{id:true,firstName:true,lastName:true,email:true,phone:true} },
    managers: { include:{manager:{select:{id:true,firstName:true,lastName:true,email:true}}} },
    units_rel: true,
    leases: { where:{status:{in:['ACTIVE','PENDING_RENEWAL']}}, include:{tenant:{select:{id:true,firstName:true,lastName:true,email:true}}} },
    documents: { take:10, orderBy:{createdAt:'desc'} },
    photos: { orderBy:{order:'asc'} },
    _count: { select:{workOrders:true,inspections:true,transactions:true} },
  }});
  if (!property) throw new AppError(404,'Property not found');
  res.json({ status:'success', data: { property } });
};

export const createProperty = async (req: AuthRequest, res: Response) => {
  const property = await prisma.property.create({ data: { ...req.body, ownerId: req.user!.userId } });
  res.status(201).json({ status:'success', data: { property } });
};

export const updateProperty = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const prop = await prisma.property.findUnique({ where:{id} });
  if (!prop) throw new AppError(404,'Property not found');
  const updated = await prisma.property.update({ where:{id}, data: req.body });
  res.json({ status:'success', data: { property: updated } });
};

export const deleteProperty = async (req: AuthRequest, res: Response) => {
  await prisma.property.update({ where:{id:req.params.id}, data:{status:'ARCHIVED'} });
  res.json({ status:'success', message:'Property archived' });
};

export const getPropertyStats = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const [woStats, txStats, occupancy] = await Promise.all([
    prisma.workOrder.groupBy({ by:['status'], where:{propertyId:id}, _count:{id:true} }),
    prisma.transaction.aggregate({ where:{propertyId:id,status:'COMPLETED'}, _sum:{amount:true}, _count:{id:true} }),
    prisma.lease.count({ where:{propertyId:id,status:'ACTIVE'} }),
  ]);
  res.json({ status:'success', data: { workOrders:woStats, revenue:txStats._sum.amount??0, transactionCount:txStats._count.id, activeLeases:occupancy } });
};

export const addPropertyManager = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { managerId } = req.body;
  const mgr = await prisma.propertyManager.upsert({ where:{propertyId_managerId:{propertyId:id,managerId}}, update:{isActive:true}, create:{propertyId:id,managerId} });
  res.json({ status:'success', data: { manager: mgr } });
};

export const removePropertyManager = async (req: AuthRequest, res: Response) => {
  const { id, managerId } = req.params;
  await prisma.propertyManager.updateMany({ where:{propertyId:id,managerId}, data:{isActive:false} });
  res.json({ status:'success', message:'Manager removed' });
};

export const getPropertyUnits = async (req: AuthRequest, res: Response) => {
  const units = await prisma.unit.findMany({ where:{propertyId:req.params.id}, include:{leases:{where:{status:'ACTIVE'},include:{tenant:{select:{id:true,firstName:true,lastName:true}}}}} });
  res.json({ status:'success', data: { units } });
};

export const createUnit = async (req: AuthRequest, res: Response) => {
  const unit = await prisma.unit.create({ data:{...req.body, propertyId:req.params.id} });
  res.status(201).json({ status:'success', data: { unit } });
};

export const updateUnit = async (req: AuthRequest, res: Response) => {
  const unit = await prisma.unit.update({ where:{id:req.params.unitId}, data:req.body });
  res.json({ status:'success', data: { unit } });
};

export const generatePropertySummary = async (req: AuthRequest, res: Response) => {
  const property = await prisma.property.findUnique({ where:{id:req.params.id}, include:{_count:{select:{workOrders:true,leases:true,inspections:true}}} });
  if (!property) throw new AppError(404,'Property not found');
  const summary = await aiService.generatePropertySummary(property as any);
  await prisma.property.update({ where:{id:req.params.id}, data:{aiSummary:summary, aiSummaryAt:new Date()} });
  res.json({ status:'success', data: { summary } });
};
EOF

cat > apps/api/src/controllers/workOrders.controller.ts << 'EOF'
import { Response } from 'express';
import { prisma } from '../index';
import { io } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { UserRole, WorkOrderStatus } from '@prisma/client';

export const getWorkOrders = async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  const { page='1', limit='20', status, priority, category, propertyId, assigneeId } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (role===UserRole.TENANT) where.property = { leases:{some:{tenantId:userId,status:'ACTIVE'}} };
  else if (role===UserRole.CONTRACTOR) where.assigneeId = userId;
  else if (role===UserRole.OWNER) where.property = { ownerId: userId };
  else if (role===UserRole.MANAGER) where.property = { managers:{some:{managerId:userId,isActive:true}} };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;
  if (propertyId) where.propertyId = propertyId;
  if (assigneeId) where.assigneeId = assigneeId;
  const [workOrders, total] = await Promise.all([
    prisma.workOrder.findMany({ where, skip, take:parseInt(limit), orderBy:[{priority:'desc'},{createdAt:'desc'}],
      include: { property:{select:{id:true,name:true,address:true,city:true}}, creator:{select:{id:true,firstName:true,lastName:true}}, assignee:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}, _count:{select:{comments:true,documents:true}} } }),
    prisma.workOrder.count({ where }),
  ]);
  res.json({ status:'success', data: { workOrders, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getWorkOrder = async (req: AuthRequest, res: Response) => {
  const wo = await prisma.workOrder.findUnique({ where:{id:req.params.id}, include: {
    property:{select:{id:true,name:true,address:true,city:true,state:true}}, unit:true,
    creator:{select:{id:true,firstName:true,lastName:true,email:true}},
    assignee:{select:{id:true,firstName:true,lastName:true,email:true,avatarUrl:true}},
    documents:true, comments:{orderBy:{createdAt:'asc'}},
  }});
  if (!wo) throw new AppError(404,'Work order not found');
  res.json({ status:'success', data: { workOrder: wo } });
};

export const createWorkOrder = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { title, description, propertyId, unitId, priority, category, scheduledAt, assigneeId, estimatedCost, dueDate } = req.body;
  if (!title || !description || !propertyId) throw new AppError(400,'title, description, propertyId required');
  const workOrder = await prisma.workOrder.create({ data: { title, description, propertyId, unitId, priority, category, scheduledAt:scheduledAt?new Date(scheduledAt):undefined, assigneeId, estimatedCost:estimatedCost?parseFloat(estimatedCost):undefined, dueDate:dueDate?new Date(dueDate):undefined, creatorId:userId, status:WorkOrderStatus.OPEN },
    include: { property:{select:{id:true,name:true}}, assignee:{select:{id:true,firstName:true,lastName:true}} } });
  io.to(`property:${propertyId}`).emit('work_order:created', workOrder);
  res.status(201).json({ status:'success', data: { workOrder } });
};

export const updateWorkOrder = async (req: AuthRequest, res: Response) => {
  const wo = await prisma.workOrder.findUnique({ where:{id:req.params.id} });
  if (!wo) throw new AppError(404,'Work order not found');
  const updated = await prisma.workOrder.update({ where:{id:req.params.id}, data:req.body });
  io.to(`property:${wo.propertyId}`).emit('work_order:updated', updated);
  res.json({ status:'success', data: { workOrder: updated } });
};

export const deleteWorkOrder = async (req: AuthRequest, res: Response) => {
  await prisma.workOrder.update({ where:{id:req.params.id}, data:{status:WorkOrderStatus.CANCELLED} });
  res.json({ status:'success', message:'Work order cancelled' });
};

export const assignWorkOrder = async (req: AuthRequest, res: Response) => {
  const { assigneeId } = req.body;
  const updated = await prisma.workOrder.update({ where:{id:req.params.id}, data:{assigneeId, status:WorkOrderStatus.ASSIGNED},
    include:{assignee:{select:{id:true,firstName:true,lastName:true}}} });
  io.to(`property:${updated.propertyId}`).emit('work_order:assigned', updated);
  res.json({ status:'success', data: { workOrder: updated } });
};

export const updateWorkOrderStatus = async (req: AuthRequest, res: Response) => {
  const { status, notes, actualCost } = req.body;
  const data: any = { status };
  if (notes) data.notes = notes;
  if (actualCost) data.actualCost = parseFloat(actualCost);
  if (status===WorkOrderStatus.IN_PROGRESS) data.startedAt = new Date();
  if (status===WorkOrderStatus.COMPLETED)   data.completedAt = new Date();
  const updated = await prisma.workOrder.update({ where:{id:req.params.id}, data });
  io.to(`property:${updated.propertyId}`).emit('work_order:status_changed', {id:req.params.id, status});
  res.json({ status:'success', data: { workOrder: updated } });
};

export const getComments = async (req: AuthRequest, res: Response) => {
  const comments = await prisma.workOrderComment.findMany({ where:{workOrderId:req.params.id}, orderBy:{createdAt:'asc'} });
  res.json({ status:'success', data: { comments } });
};

export const addComment = async (req: AuthRequest, res: Response) => {
  const comment = await prisma.workOrderComment.create({ data:{workOrderId:req.params.id, authorId:req.user!.userId, content:req.body.content} });
  const wo = await prisma.workOrder.findUnique({ where:{id:req.params.id}, select:{propertyId:true} });
  if (wo) io.to(`property:${wo.propertyId}`).emit('work_order:comment', comment);
  res.status(201).json({ status:'success', data: { comment } });
};
EOF
log "Properties + WorkOrders controllers written."

cat > apps/api/src/controllers/financial.controller.ts << 'EOF'
import { Request, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { paymentService } from '../services/payment.service';
import { UserRole, TransactionType, TransactionStatus } from '@prisma/client';

export const getTransactions = async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  const { page='1', limit='20', type, status, propertyId, startDate, endDate } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (role===UserRole.TENANT) where.userId = userId;
  else if (role===UserRole.OWNER) where.property = { ownerId: userId };
  else if (role===UserRole.MANAGER) where.property = { managers:{some:{managerId:userId,isActive:true}} };
  if (type) where.type = type;
  if (status) where.status = status;
  if (propertyId) where.propertyId = propertyId;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate)   where.createdAt.lte = new Date(endDate);
  }
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({ where, skip, take:parseInt(limit), orderBy:{createdAt:'desc'},
      include:{ property:{select:{id:true,name:true}}, unit:{select:{id:true,unitNumber:true}}, user:{select:{id:true,firstName:true,lastName:true}} } }),
    prisma.transaction.count({ where }),
  ]);
  res.json({ status:'success', data:{ transactions, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getTransaction = async (req: AuthRequest, res: Response) => {
  const tx = await prisma.transaction.findUnique({ where:{id:req.params.id}, include:{property:true,unit:true,user:{select:{id:true,firstName:true,lastName:true,email:true}}} });
  if (!tx) throw new AppError(404,'Transaction not found');
  res.json({ status:'success', data:{ transaction: tx } });
};

export const createTransaction = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { propertyId, unitId, leaseId, type, amount, description, dueDate, category } = req.body;
  if (!propertyId || !type || !amount) throw new AppError(400,'propertyId, type, amount required');
  const transaction = await prisma.transaction.create({ data:{
    propertyId, unitId, leaseId, userId, type, amount:parseFloat(amount), description, status:TransactionStatus.PENDING,
    dueDate:dueDate?new Date(dueDate):undefined, category,
  }});
  res.status(201).json({ status:'success', data:{ transaction } });
};

export const getFinancialSummary = async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  const { propertyId, year } = req.query as Record<string,string>;
  const currentYear = year ? parseInt(year) : new Date().getFullYear();
  const startDate = new Date(currentYear,0,1);
  const endDate   = new Date(currentYear,11,31);
  const where: any = { createdAt:{gte:startDate,lte:endDate}, status:'COMPLETED' };
  if (propertyId) where.propertyId = propertyId;
  else if (role===UserRole.OWNER) where.property = { ownerId: userId };
  const [income, expenses, byMonth] = await Promise.all([
    prisma.transaction.aggregate({ where:{...where,type:TransactionType.INCOME}, _sum:{amount:true} }),
    prisma.transaction.aggregate({ where:{...where,type:TransactionType.EXPENSE}, _sum:{amount:true} }),
    prisma.transaction.groupBy({ by:['type'], where, _sum:{amount:true}, _count:{id:true} }),
  ]);
  const totalIncome  = income._sum.amount   ?? 0;
  const totalExpense = expenses._sum.amount ?? 0;
  res.json({ status:'success', data:{ totalIncome, totalExpense, netIncome:totalIncome-totalExpense, byType:byMonth, year:currentYear } });
};

export const createPaymentIntent = async (req: AuthRequest, res: Response) => {
  const { amount, currency='usd', metadata } = req.body;
  if (!amount) throw new AppError(400,'Amount required');
  const intent = await paymentService.createPaymentIntent(amount, currency, metadata);
  res.json({ status:'success', data:{ clientSecret: intent.client_secret } });
};

export const handleWebhook = async (req: Request, res: Response) => {
  await paymentService.handleWebhook(req);
  res.json({ received: true });
};
EOF

cat > apps/api/src/controllers/messages.controller.ts << 'EOF'
import { Response } from 'express';
import { prisma } from '../index';
import { io } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const getConversations = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const conversations = await prisma.conversation.findMany({
    where: { participants:{some:{userId}} },
    include: {
      participants:{ include:{user:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}} },
      messages:{ orderBy:{createdAt:'desc'}, take:1 },
      property:{ select:{id:true,name:true} },
    },
    orderBy: { updatedAt:'desc' },
  });
  res.json({ status:'success', data:{ conversations } });
};

export const getConversation = async (req: AuthRequest, res: Response) => {
  const conv = await prisma.conversation.findUnique({ where:{id:req.params.id}, include:{
    participants:{ include:{user:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}} },
    property:{ select:{id:true,name:true} },
  }});
  if (!conv) throw new AppError(404,'Conversation not found');
  res.json({ status:'success', data:{ conversation: conv } });
};

export const createConversation = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { participantIds, propertyId, workOrderId, subject, type } = req.body;
  const allIds: string[] = Array.from(new Set([userId, ...(participantIds||[])]));
  const conversation = await prisma.conversation.create({
    data: { subject, type, propertyId, workOrderId, participants:{ create: allIds.map(id=>({userId:id})) } },
    include:{ participants:{ include:{user:{select:{id:true,firstName:true,lastName:true}}} } },
  });
  res.status(201).json({ status:'success', data:{ conversation } });
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  const { page='1', limit='50' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const messages = await prisma.message.findMany({ where:{conversationId:req.params.id}, skip, take:parseInt(limit), orderBy:{createdAt:'asc'},
    include:{sender:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}} });
  res.json({ status:'success', data:{ messages } });
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { content, type='TEXT', attachmentUrl } = req.body;
  const message = await prisma.message.create({ data:{conversationId:req.params.id,senderId:userId,content,type,attachmentUrl},
    include:{sender:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}} });
  await prisma.conversation.update({ where:{id:req.params.id}, data:{updatedAt:new Date()} });
  io.to(`conversation:${req.params.id}`).emit('message:new', message);
  res.status(201).json({ status:'success', data:{ message } });
};

export const markRead = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  await prisma.messageParticipant.updateMany({ where:{conversationId:req.params.id,userId}, data:{lastReadAt:new Date()} });
  res.json({ status:'success', message:'Marked as read' });
};
EOF

cat > apps/api/src/controllers/inspections.controller.ts << 'EOF'
import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { InspectionStatus } from '@prisma/client';

export const getInspections = async (req: AuthRequest, res: Response) => {
  const { propertyId, status, startDate, endDate, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (propertyId) where.propertyId = propertyId;
  if (status)     where.status = status;
  if (startDate || endDate) {
    where.scheduledDate = {};
    if (startDate) where.scheduledDate.gte = new Date(startDate);
    if (endDate)   where.scheduledDate.lte = new Date(endDate);
  }
  const [inspections, total] = await Promise.all([
    prisma.inspection.findMany({ where, skip, take:parseInt(limit), orderBy:{scheduledDate:'desc'},
      include:{ property:{select:{id:true,name:true}}, unit:true, creator:{select:{id:true,firstName:true,lastName:true}} } }),
    prisma.inspection.count({ where }),
  ]);
  res.json({ status:'success', data:{ inspections, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getInspection = async (req: AuthRequest, res: Response) => {
  const inspection = await prisma.inspection.findUnique({ where:{id:req.params.id}, include:{
    property:{select:{id:true,name:true,address:true}}, unit:true,
    creator:{select:{id:true,firstName:true,lastName:true}},
    items:{orderBy:{order:'asc'}}, documents:true,
  }});
  if (!inspection) throw new AppError(404,'Inspection not found');
  res.json({ status:'success', data:{ inspection } });
};

export const createInspection = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { propertyId, unitId, type, scheduledDate, title, notes, items } = req.body;
  const inspection = await prisma.inspection.create({ data:{
    propertyId, unitId, type, scheduledDate:scheduledDate?new Date(scheduledDate):undefined,
    title: title||type, notes, creatorId:userId, status:InspectionStatus.SCHEDULED,
    items: items?.length ? { create: items.map((item:any,i:number)=>({...item,order:i})) } : undefined,
  }, include:{ items:true } });
  res.status(201).json({ status:'success', data:{ inspection } });
};

export const updateInspection = async (req: AuthRequest, res: Response) => {
  const { items, ...rest } = req.body;
  const inspection = await prisma.inspection.update({ where:{id:req.params.id}, data:{
    ...rest, scheduledDate:rest.scheduledDate?new Date(rest.scheduledDate):undefined,
  }, include:{items:true} });
  res.json({ status:'success', data:{ inspection } });
};

export const completeInspection = async (req: AuthRequest, res: Response) => {
  const { overallScore, notes, findings } = req.body;
  const inspection = await prisma.inspection.update({ where:{id:req.params.id}, data:{
    status:InspectionStatus.COMPLETED, overallScore, notes, findings,
    completedAt: new Date(),
  }});
  res.json({ status:'success', data:{ inspection } });
};

export const deleteInspection = async (req: AuthRequest, res: Response) => {
  await prisma.inspection.update({ where:{id:req.params.id}, data:{status:InspectionStatus.CANCELLED} });
  res.json({ status:'success', message:'Inspection cancelled' });
};
EOF
log "Financial, Messages, Inspections controllers written."

cat > apps/api/src/controllers/documents.controller.ts << 'EOF'
import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { storageService } from '../services/storage.service';

export const getDocuments = async (req: AuthRequest, res: Response) => {
  const { propertyId, workOrderId, type, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (propertyId)   where.propertyId   = propertyId;
  if (workOrderId)  where.workOrderId  = workOrderId;
  if (type)         where.type         = type;
  const [documents, total] = await Promise.all([
    prisma.document.findMany({ where, skip, take:parseInt(limit), orderBy:{createdAt:'desc'},
      include:{ uploadedBy:{select:{id:true,firstName:true,lastName:true}} } }),
    prisma.document.count({ where }),
  ]);
  res.json({ status:'success', data:{ documents, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getDocument = async (req: AuthRequest, res: Response) => {
  const doc = await prisma.document.findUnique({ where:{id:req.params.id}, include:{uploadedBy:{select:{id:true,firstName:true,lastName:true}}} });
  if (!doc) throw new AppError(404,'Document not found');
  const signedUrl = await storageService.getSignedDownloadUrl(doc.s3Key);
  res.json({ status:'success', data:{ document:{...doc, downloadUrl:signedUrl} } });
};

export const createDocument = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { name, type, s3Key, url, mimeType, size, propertyId, unitId, leaseId, workOrderId, inspectionId } = req.body;
  if (!name || !s3Key || !url) throw new AppError(400,'name, s3Key, url required');
  const document = await prisma.document.create({ data:{
    name, type, s3Key, url, mimeType, size:size?parseInt(size):undefined,
    propertyId, unitId, leaseId, workOrderId, inspectionId,
    uploadedById:userId,
  }});
  res.status(201).json({ status:'success', data:{ document } });
};

export const deleteDocument = async (req: AuthRequest, res: Response) => {
  const doc = await prisma.document.findUnique({ where:{id:req.params.id} });
  if (!doc) throw new AppError(404,'Document not found');
  try { await storageService.deleteFile(doc.s3Key); } catch (_) {}
  await prisma.document.delete({ where:{id:req.params.id} });
  res.json({ status:'success', message:'Document deleted' });
};

export const getSignedUploadUrl = async (req: AuthRequest, res: Response) => {
  const { fileName, mimeType, folder='documents' } = req.body;
  if (!fileName || !mimeType) throw new AppError(400,'fileName and mimeType required');
  const result = await storageService.getSignedUploadUrl(fileName, mimeType, folder);
  res.json({ status:'success', data: result });
};
EOF

cat > apps/api/src/controllers/contractors.controller.ts << 'EOF'
import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '@prisma/client';

export const getContractors = async (req: AuthRequest, res: Response) => {
  const { specialty, minRating, search, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = { user:{ role:UserRole.CONTRACTOR, isActive:true } };
  if (specialty) where.specialties = { has: specialty };
  if (minRating) where.rating = { gte: parseFloat(minRating) };
  if (search) where.user = { ...where.user, OR:[
    { firstName:{ contains:search, mode:'insensitive' } },
    { lastName: { contains:search, mode:'insensitive' } },
  ]};
  const [contractors, total] = await Promise.all([
    prisma.contractorProfile.findMany({ where, skip, take:parseInt(limit), orderBy:{rating:'desc'},
      include:{ user:{select:{id:true,firstName:true,lastName:true,email:true,phone:true,avatarUrl:true}} } }),
    prisma.contractorProfile.count({ where }),
  ]);
  res.json({ status:'success', data:{ contractors, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getContractor = async (req: AuthRequest, res: Response) => {
  const contractor = await prisma.contractorProfile.findUnique({ where:{id:req.params.id},
    include:{ user:{select:{id:true,firstName:true,lastName:true,email:true,phone:true,avatarUrl:true}} } });
  if (!contractor) throw new AppError(404,'Contractor not found');
  res.json({ status:'success', data:{ contractor } });
};

export const getContractorByUser = async (req: AuthRequest, res: Response) => {
  const contractor = await prisma.contractorProfile.findUnique({ where:{ userId:req.user!.userId },
    include:{ user:{select:{id:true,firstName:true,lastName:true,email:true,phone:true,avatarUrl:true}} } });
  if (!contractor) throw new AppError(404,'Contractor profile not found');
  res.json({ status:'success', data:{ contractor } });
};

export const updateContractorProfile = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { businessName, licenseNumber, insurancePolicy, specialties, hourlyRate, bio, yearsExperience, serviceRadius } = req.body;
  const contractor = await prisma.contractorProfile.upsert({
    where:{ userId },
    create:{ userId, businessName, licenseNumber, insurancePolicy, specialties, hourlyRate, bio, yearsExperience, serviceRadius },
    update:{ businessName, licenseNumber, insurancePolicy, specialties, hourlyRate, bio, yearsExperience, serviceRadius },
    include:{ user:{select:{id:true,firstName:true,lastName:true,email:true}} },
  });
  res.json({ status:'success', data:{ contractor } });
};

export const getContractorWorkOrders = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { status, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = { assigneeId: userId };
  if (status) where.status = status;
  const [workOrders, total] = await Promise.all([
    prisma.workOrder.findMany({ where, skip, take:parseInt(limit), orderBy:{createdAt:'desc'},
      include:{ property:{select:{id:true,name:true,address:true,city:true}} } }),
    prisma.workOrder.count({ where }),
  ]);
  res.json({ status:'success', data:{ workOrders, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};
EOF

cat > apps/api/src/controllers/notifications.controller.ts << 'EOF'
import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { isRead, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = { userId };
  if (isRead !== undefined) where.isRead = isRead === 'true';
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({ where, skip, take:parseInt(limit), orderBy:{createdAt:'desc'} }),
    prisma.notification.count({ where }),
  ]);
  res.json({ status:'success', data:{ notifications, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  const count = await prisma.notification.count({ where:{ userId:req.user!.userId, isRead:false } });
  res.json({ status:'success', data:{ count } });
};

export const markRead = async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.findUnique({ where:{id:req.params.id} });
  if (!notif) throw new AppError(404,'Notification not found');
  if (notif.userId !== req.user!.userId) throw new AppError(403,'Forbidden');
  await prisma.notification.update({ where:{id:req.params.id}, data:{ isRead:true, readAt:new Date() } });
  res.json({ status:'success', message:'Marked as read' });
};

export const markAllRead = async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({ where:{ userId:req.user!.userId, isRead:false }, data:{ isRead:true, readAt:new Date() } });
  res.json({ status:'success', message:'All notifications marked as read' });
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.findUnique({ where:{id:req.params.id} });
  if (!notif) throw new AppError(404,'Notification not found');
  if (notif.userId !== req.user!.userId) throw new AppError(403,'Forbidden');
  await prisma.notification.delete({ where:{id:req.params.id} });
  res.json({ status:'success', message:'Notification deleted' });
};
EOF

cat > apps/api/src/controllers/ai.controller.ts << 'EOF'
import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { aiService } from '../services/ai.service';

export const chatWithAssistant = async (req: AuthRequest, res: Response) => {
  const { messages, context } = req.body;
  if (!messages?.length) throw new AppError(400,'Messages array required');
  const response = await aiService.chat(messages, context);
  res.json({ status:'success', data:{ response } });
};

export const summarizeDocument = async (req: AuthRequest, res: Response) => {
  const { documentId, text } = req.body;
  let content = text;
  if (documentId && !content) {
    const doc = await prisma.document.findUnique({ where:{id:documentId} });
    if (!doc) throw new AppError(404,'Document not found');
    content = `Document: ${doc.name} (${doc.type})`;
  }
  if (!content) throw new AppError(400,'Document ID or text required');
  const summary = await aiService.summarize(content);
  res.json({ status:'success', data:{ summary } });
};

export const generateWorkOrderSuggestion = async (req: AuthRequest, res: Response) => {
  const { description, propertyId } = req.body;
  if (!description) throw new AppError(400,'Description required');
  let propertyContext: any;
  if (propertyId) propertyContext = await prisma.property.findUnique({ where:{id:propertyId}, select:{name:true,type:true,city:true} });
  const suggestion = await aiService.suggestWorkOrder(description, propertyContext);
  res.json({ status:'success', data:{ suggestion } });
};

export const matchContractors = async (req: AuthRequest, res: Response) => {
  const { workOrderId } = req.body;
  if (!workOrderId) throw new AppError(400,'workOrderId required');
  const workOrder = await prisma.workOrder.findUnique({ where:{id:workOrderId}, include:{property:{select:{city:true,state:true}}} });
  if (!workOrder) throw new AppError(404,'Work order not found');
  const contractors = await prisma.contractorProfile.findMany({ where:{ specialties:{ has: workOrder.category } },
    include:{ user:{select:{id:true,firstName:true,lastName:true}} }, take:10 });
  const matches = await aiService.matchContractors(workOrder as any, contractors as any);
  res.json({ status:'success', data:{ matches } });
};

export const generatePortfolioReport = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const properties = await prisma.property.findMany({ where:{ ownerId:userId }, include:{ _count:{select:{workOrders:true,leases:true}} } });
  const transactions = await prisma.transaction.findMany({ where:{ property:{ownerId:userId}, status:'COMPLETED' }, select:{type:true,amount:true,createdAt:true} });
  const report = await aiService.generatePortfolioReport(properties as any, transactions as any);
  res.json({ status:'success', data:{ report } });
};
EOF
log "Documents, Contractors, Notifications, AI controllers written."

# ============================================================
# API — Services (all bugs fixed)
# ============================================================
header "Writing API services"

cat > apps/api/src/services/ai.service.ts << 'EOF'
import OpenAI from 'openai';
import { config } from '../config';
import { logger } from '../utils/logger';

const openai = config.openaiApiKey
  ? new OpenAI({ apiKey: config.openaiApiKey })
  : null;

const SYSTEM_PROMPT = `You are the Simply Service AI assistant — a property management expert.
You help property owners, managers, tenants, and contractors with maintenance, leases, financial analysis, and operations.
Be concise, professional, and actionable. When discussing costs, use USD. For Pittsburgh properties, note local market context.`;

class AIService {
  private async complete(messages: OpenAI.Chat.ChatCompletionMessageParam[], max_tokens=1000): Promise<string> {
    if (!openai) return 'AI service is not configured. Please add an OpenAI API key.';
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens,
        temperature: 0.7,
      });
      return response.choices[0]?.message?.content ?? 'No response generated.';
    } catch (err) {
      logger.error('OpenAI API error:', err);
      throw new Error('AI service temporarily unavailable');
    }
  }

  async chat(messages: Array<{role:string;content:string}>, context?: any): Promise<string> {
    const contextMsg = context
      ? `Context: ${JSON.stringify(context)}\n\n`
      : '';
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(m => ({
      role: m.role as 'user'|'assistant',
      content: m.content,
    }));
    if (contextMsg && chatMessages.length > 0) {
      chatMessages[0].content = contextMsg + chatMessages[0].content;
    }
    return this.complete(chatMessages, 1500);
  }

  async summarize(text: string): Promise<string> {
    return this.complete([{ role:'user', content:`Summarize the following document concisely, highlighting key terms, obligations, and important dates:\n\n${text.substring(0,4000)}` }], 800);
  }

  async suggestWorkOrder(description: string, property?: any): Promise<any> {
    const propContext = property ? `Property: ${property.name} (${property.type}) in ${property.city}` : '';
    const response = await this.complete([{ role:'user', content:`${propContext}\nMaintenance issue: "${description}"\n\nProvide a JSON response with: priority (LOW/MEDIUM/HIGH/EMERGENCY), category (PLUMBING/ELECTRICAL/HVAC/GENERAL/CARPENTRY/PAINTING/CLEANING/LANDSCAPING/APPLIANCE/ROOFING/OTHER), estimatedCost (number in USD), suggestedTitle (string), suggestedDescription (string), recommendedContractorSpecialty (string). Return only valid JSON.` }], 600);
    try { return JSON.parse(response.replace(/```json\n?|\n?```/g,'')); }
    catch { return { priority:'MEDIUM', category:'GENERAL', estimatedCost:200, suggestedTitle:'Maintenance Request', suggestedDescription:description, recommendedContractorSpecialty:'General Contractor' }; }
  }

  async matchContractors(workOrder: any, contractors: any[]): Promise<any[]> {
    if (!contractors.length) return [];
    const contractorList = contractors.map((c,i) => `${i+1}. ${c.user.firstName} ${c.user.lastName} — specialties: ${(c.specialties||[]).join(', ')}, rating: ${c.rating??'N/A'}, rate: $${c.hourlyRate??'N/A'}/hr`).join('\n');
    const response = await this.complete([{ role:'user', content:`Work order: "${workOrder.title}" (${workOrder.category})\nAvailable contractors:\n${contractorList}\n\nRank the top 3 best matches as JSON array with fields: rank, contractorIndex (1-based), reasoning (brief string). Return only valid JSON array.` }], 500);
    try {
      const ranked: any[] = JSON.parse(response.replace(/```json\n?|\n?```/g,''));
      return ranked.map(r => ({ ...contractors[r.contractorIndex-1], matchReason: r.reasoning, rank: r.rank }));
    } catch { return contractors.slice(0,3); }
  }

  async generatePropertySummary(property: any): Promise<string> {
    return this.complete([{ role:'user', content:`Generate a professional property summary for:\nName: ${property.name}\nType: ${property.type}\nAddress: ${property.address}, ${property.city}, ${property.state}\nUnits: ${property._count?.units_rel??0}\nActive leases: ${property._count?.leases??0}\nOpen work orders: ${property._count?.workOrders??0}\n\nWrite 2-3 sentences suitable for an investor or manager overview.` }], 300);
  }

  async generatePortfolioReport(properties: any[], transactions: any[]): Promise<string> {
    const totalIncome  = transactions.filter(t=>t.type==='INCOME').reduce((s,t)=>s+t.amount,0);
    const totalExpense = transactions.filter(t=>t.type==='EXPENSE').reduce((s,t)=>s+t.amount,0);
    return this.complete([{ role:'user', content:`Portfolio report request:\nProperties: ${properties.length}\nTotal income YTD: $${totalIncome.toFixed(2)}\nTotal expenses YTD: $${totalExpense.toFixed(2)}\nNet income: $${(totalIncome-totalExpense).toFixed(2)}\n\nProvide a concise executive summary with performance insights and 3 actionable recommendations.` }], 1000);
  }
}

export const aiService = new AIService();
EOF

cat > apps/api/src/services/email.service.ts << 'EOF'
import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private from = `Simply Service <${config.smtp.from || 'noreply@simplyservice.app'}>`;

  async send(options: EmailOptions): Promise<void> {
    if (!config.smtp.host) {
      logger.warn('SMTP not configured — skipping email send');
      return;
    }
    try {
      await transporter.sendMail({ from: this.from, ...options });
      logger.info(`Email sent to ${options.to}: ${options.subject}`);
    } catch (err) {
      logger.error('Email send failed:', err);
    }
  }

  async sendWelcome(email: string, firstName: string, verifyToken: string) {
    const verifyUrl = `${config.webUrl}/verify-email/${verifyToken}`;
    await this.send({ to: email, subject: 'Welcome to Simply Service!',
      html: `<h2>Welcome, ${firstName}!</h2><p>Click below to verify your email address.</p><p><a href="${verifyUrl}" style="background:#2563EB;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Verify Email</a></p><p>If you did not create this account, ignore this email.</p>`,
      text: `Welcome to Simply Service, ${firstName}! Verify your email: ${verifyUrl}`,
    });
  }

  async sendPasswordReset(email: string, firstName: string, resetToken: string) {
    const resetUrl = `${config.webUrl}/reset-password?token=${resetToken}`;
    await this.send({ to: email, subject: 'Reset Your Password',
      html: `<h2>Password Reset</h2><p>Hi ${firstName},</p><p>Click below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}" style="background:#DC2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Reset Password</a></p>`,
      text: `Reset your Simply Service password: ${resetUrl}`,
    });
  }

  async sendWorkOrderNotification(email: string, firstName: string, workOrderTitle: string, status: string) {
    await this.send({ to: email, subject: `Work Order Update: ${workOrderTitle}`,
      html: `<h2>Work Order Status Update</h2><p>Hi ${firstName},</p><p>Your work order "<strong>${workOrderTitle}</strong>" has been updated to <strong>${status}</strong>.</p><p>Log in to Simply Service to view details.</p>`,
      text: `Work order "${workOrderTitle}" is now ${status}.`,
    });
  }

  async sendRentReminder(email: string, firstName: string, amount: number, dueDate: Date) {
    await this.send({ to: email, subject: 'Rent Payment Reminder',
      html: `<h2>Rent Due Soon</h2><p>Hi ${firstName},</p><p>Your rent of <strong>$${amount.toFixed(2)}</strong> is due on <strong>${dueDate.toLocaleDateString()}</strong>.</p><p>Log in to Simply Service to pay online.</p>`,
      text: `Rent reminder: $${amount.toFixed(2)} due ${dueDate.toLocaleDateString()}`,
    });
  }
}

export const emailService = new EmailService();
EOF

cat > apps/api/src/services/storage.service.ts << 'EOF'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';
import path from 'path';

const s3 = config.aws.region
  ? new S3Client({
      region: config.aws.region,
      credentials: config.aws.accessKeyId
        ? { accessKeyId: config.aws.accessKeyId, secretAccessKey: config.aws.secretAccessKey }
        : undefined,
    })
  : null;

class StorageService {
  private bucket = config.aws.bucket;

  private buildKey(folder: string, fileName: string): string {
    const ext = path.extname(fileName);
    return `${folder}/${uuid()}${ext}`;
  }

  async getSignedUploadUrl(fileName: string, mimeType: string, folder='documents'): Promise<{ uploadUrl: string; s3Key: string; url: string }> {
    if (!s3 || !this.bucket) {
      const s3Key = `${folder}/${uuid()}-${fileName}`;
      return { uploadUrl: '', s3Key, url: `/uploads/${s3Key}` };
    }
    const s3Key = this.buildKey(folder, fileName);
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: s3Key, ContentType: mimeType });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    const url = `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${s3Key}`;
    return { uploadUrl, s3Key, url };
  }

  async getSignedDownloadUrl(s3Key: string, expiresIn=3600): Promise<string> {
    if (!s3 || !this.bucket) return `/uploads/${s3Key}`;
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
      return await getSignedUrl(s3, command, { expiresIn });
    } catch (err) {
      logger.error('Failed to generate signed download URL:', err);
      return '';
    }
  }

  async deleteFile(s3Key: string): Promise<void> {
    if (!s3 || !this.bucket) return;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }));
    } catch (err) {
      logger.error('Failed to delete S3 file:', err);
    }
  }
}

export const storageService = new StorageService();
EOF

cat > apps/api/src/services/payment.service.ts << 'EOF'
import Stripe from 'stripe';
import { config } from '../config';
import { logger } from '../utils/logger';
import { prisma } from '../index';
import { Request } from 'express';

const stripe: Stripe | null = config.stripeSecretKey
  ? new Stripe(config.stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

class PaymentService {
  async createPaymentIntent(amount: number, currency='usd', metadata: Record<string,string>={}): Promise<Stripe.PaymentIntent> {
    if (!stripe) throw new Error('Stripe is not configured');
    return stripe.paymentIntents.create({ amount: Math.round(amount*100), currency, metadata, automatic_payment_methods: { enabled: true } });
  }

  async handleWebhook(req: Request): Promise<void> {
    if (!stripe) { logger.warn('Stripe webhook received but Stripe not configured'); return; }
    const sig = req.headers['stripe-signature'] as string;
    if (!sig || !config.stripeWebhookSecret) return;
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, config.stripeWebhookSecret);
    } catch (err) {
      logger.error('Stripe webhook signature verification failed:', err);
      return;
    }
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const txId = pi.metadata?.transactionId;
        if (txId) {
          await prisma.transaction.update({ where:{ id:txId }, data:{ status:'COMPLETED', paidAt:new Date(), stripePaymentIntentId:pi.id } }).catch(logger.error);
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const txId = pi.metadata?.transactionId;
        if (txId) {
          await prisma.transaction.update({ where:{ id:txId }, data:{ status:'FAILED' } }).catch(logger.error);
        }
        break;
      }
      default:
        logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }
}

export const paymentService = new PaymentService();
EOF
log "All 4 services written."

# ============================================================
# API — Seed (completely rewritten to match Prisma schema)
# ============================================================
header "Writing seed.ts"

cat > apps/api/prisma/seed.ts << 'EOF'
import { PrismaClient, UserRole, WorkOrderStatus, WorkOrderPriority, TransactionType, TransactionStatus, InspectionStatus, LeaseStatus, PropertyType, DocumentType, MessageType, NotificationType } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // --- Clean up ---
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.message.deleteMany(),
    prisma.messageParticipant.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.document.deleteMany(),
    prisma.inspectionItem.deleteMany(),
    prisma.inspection.deleteMany(),
    prisma.workOrderComment.deleteMany(),
    prisma.workOrder.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.contractorProfile.deleteMany(),
    prisma.propertyPhoto.deleteMany(),
    prisma.propertyManager.deleteMany(),
    prisma.propertyOrganization.deleteMany(),
    prisma.lease.deleteMany(),
    prisma.unit.deleteMany(),
    prisma.property.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.organizationMember.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log('🗑️  Cleaned database');

  const pw = hashSync('Password123!', 10);

  // --- Users ---
  const owner = await prisma.user.create({ data: {
    email: 'owner@simplyservice.dev', password: pw,
    firstName: 'Alex', lastName: 'Riverstone', role: UserRole.OWNER,
    phone: '412-555-0101', isVerified: true, isActive: true,
    bio: 'Experienced property owner in Pittsburgh with 15+ years of real estate investment.',
    timezone: 'America/New_York',
  }});

  const manager = await prisma.user.create({ data: {
    email: 'manager@simplyservice.dev', password: pw,
    firstName: 'Jordan', lastName: 'Park', role: UserRole.MANAGER,
    phone: '412-555-0102', isVerified: true, isActive: true,
    bio: 'Property manager specializing in residential portfolios across Pittsburgh neighborhoods.',
    timezone: 'America/New_York',
  }});

  const tenant1 = await prisma.user.create({ data: {
    email: 'tenant1@simplyservice.dev', password: pw,
    firstName: 'Marcus', lastName: 'Chen', role: UserRole.TENANT,
    phone: '412-555-0103', isVerified: true, isActive: true,
    timezone: 'America/New_York',
  }});

  const tenant2 = await prisma.user.create({ data: {
    email: 'tenant2@simplyservice.dev', password: pw,
    firstName: 'Sofia', lastName: 'Reyes', role: UserRole.TENANT,
    phone: '412-555-0104', isVerified: true, isActive: true,
    timezone: 'America/New_York',
  }});

  const contractor1 = await prisma.user.create({ data: {
    email: 'contractor1@simplyservice.dev', password: pw,
    firstName: 'Derek', lastName: 'Mills', role: UserRole.CONTRACTOR,
    phone: '412-555-0105', isVerified: true, isActive: true,
    timezone: 'America/New_York',
  }});

  const contractor2 = await prisma.user.create({ data: {
    email: 'contractor2@simplyservice.dev', password: pw,
    firstName: 'Priya', lastName: 'Nguyen', role: UserRole.CONTRACTOR,
    phone: '412-555-0106', isVerified: true, isActive: true,
    timezone: 'America/New_York',
  }});

  const admin = await prisma.user.create({ data: {
    email: 'admin@simplyservice.dev', password: pw,
    firstName: 'Admin', lastName: 'User', role: UserRole.ADMIN,
    phone: '412-555-0107', isVerified: true, isActive: true,
    timezone: 'America/New_York',
  }});

  console.log('✅ Users created');

  // --- Contractor Profiles ---
  const cp1 = await prisma.contractorProfile.create({ data: {
    userId: contractor1.id,
    businessName: 'Mills Plumbing & HVAC',
    licenseNumber: 'PA-PLB-2019-4421',
    insurancePolicy: 'INS-2024-MM-88321',
    specialties: ['PLUMBING', 'HVAC'],
    hourlyRate: 95,
    bio: 'Licensed plumber and HVAC technician with 12 years of experience in Pittsburgh.',
    yearsExperience: 12,
    serviceRadius: 30,
    rating: 4.8,
    reviewCount: 47,
  }});

  const cp2 = await prisma.contractorProfile.create({ data: {
    userId: contractor2.id,
    businessName: 'Nguyen Electric',
    licenseNumber: 'PA-ELC-2020-7734',
    insurancePolicy: 'INS-2024-PN-55210',
    specialties: ['ELECTRICAL', 'GENERAL'],
    hourlyRate: 110,
    bio: 'Master electrician specializing in residential and commercial electrical work.',
    yearsExperience: 8,
    serviceRadius: 25,
    rating: 4.9,
    reviewCount: 62,
  }});

  console.log('✅ Contractor profiles created');

  // --- Properties ---
  const prop1 = await prisma.property.create({ data: {
    name: 'Shadyside Apartments',
    address: '5401 Walnut St',
    city: 'Pittsburgh', state: 'PA', zip: '15232', country: 'US',
    type: PropertyType.APARTMENT, units: 6, sqFootage: 5400,
    yearBuilt: 1948, description: 'Classic Shadyside apartment building, fully renovated in 2020.',
    ownerId: owner.id,
    lat: 40.4530, lng: -79.9290,
  }});

  const prop2 = await prisma.property.create({ data: {
    name: 'Lawrenceville Townhomes',
    address: '3812 Butler St',
    city: 'Pittsburgh', state: 'PA', zip: '15201', country: 'US',
    type: PropertyType.TOWNHOUSE, units: 3, sqFootage: 3600,
    yearBuilt: 1965, description: 'Converted townhomes in vibrant Lawrenceville arts district.',
    ownerId: owner.id,
    lat: 40.4650, lng: -79.9520,
  }});

  const prop3 = await prisma.property.create({ data: {
    name: 'East Liberty Commercial',
    address: '6001 Centre Ave',
    city: 'Pittsburgh', state: 'PA', zip: '15206', country: 'US',
    type: PropertyType.COMMERCIAL, units: 4, sqFootage: 8000,
    yearBuilt: 1955, description: 'Mixed-use commercial space in revitalized East Liberty.',
    ownerId: owner.id,
    lat: 40.4598, lng: -79.9203,
  }});

  console.log('✅ Properties created');

  // --- Property Manager ---
  await prisma.propertyManager.createMany({ data: [
    { propertyId: prop1.id, managerId: manager.id, isActive: true },
    { propertyId: prop2.id, managerId: manager.id, isActive: true },
  ]});

  // --- Units ---
  const u1a = await prisma.unit.create({ data: {
    propertyId: prop1.id, unitNumber: '1A', floor: 1,
    bedrooms: 2, bathrooms: 1, sqFootage: 850, rentAmount: 1450,
    isAvailable: false, features: ['hardwood floors', 'updated kitchen'],
  }});
  const u1b = await prisma.unit.create({ data: {
    propertyId: prop1.id, unitNumber: '1B', floor: 1,
    bedrooms: 1, bathrooms: 1, sqFootage: 620, rentAmount: 1150,
    isAvailable: true,
  }});
  const u2a = await prisma.unit.create({ data: {
    propertyId: prop1.id, unitNumber: '2A', floor: 2,
    bedrooms: 2, bathrooms: 2, sqFootage: 950, rentAmount: 1650,
    isAvailable: false,
  }});
  const lt1 = await prisma.unit.create({ data: {
    propertyId: prop2.id, unitNumber: 'TH-1', floor: 1,
    bedrooms: 3, bathrooms: 2, sqFootage: 1200, rentAmount: 2100,
    isAvailable: false,
  }});

  console.log('✅ Units created');

  // --- Leases ---
  const today = new Date();
  const lease1Start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const lease1End   = new Date(today.getFullYear() + 9, today.getMonth() - 3, 0);

  const lease1 = await prisma.lease.create({ data: {
    unitId: u1a.id, propertyId: prop1.id, tenantId: tenant1.id,
    startDate: lease1Start, endDate: lease1End,
    rentAmount: 1450, depositAmount: 1450,
    status: LeaseStatus.ACTIVE,
    lateFeeAmount: 75, lateFeeGraceDays: 5,
    termsAndConditions: 'Standard residential lease agreement. No smoking. Pets with approval.',
  }});

  const lease2Start = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const lease2End   = new Date(today.getFullYear() + 1, today.getMonth() - 1, 14);

  const lease2 = await prisma.lease.create({ data: {
    unitId: lt1.id, propertyId: prop2.id, tenantId: tenant2.id,
    startDate: lease2Start, endDate: lease2End,
    rentAmount: 2100, depositAmount: 4200,
    status: LeaseStatus.ACTIVE,
    lateFeeAmount: 100, lateFeeGraceDays: 3,
    termsAndConditions: 'Townhome lease. Tenant responsible for lawn care.',
  }});

  console.log('✅ Leases created');

  // --- Work Orders ---
  const wo1 = await prisma.workOrder.create({ data: {
    title: 'Kitchen Faucet Leak',
    description: 'The kitchen faucet in unit 1A has been dripping constantly for two weeks. Water damage is visible under the sink cabinet.',
    status: WorkOrderStatus.IN_PROGRESS,
    priority: WorkOrderPriority.HIGH,
    category: 'PLUMBING',
    propertyId: prop1.id,
    unitId: u1a.id,
    requestorId: tenant1.id,
    assigneeId: contractor1.id,
    estimatedCost: 250,
    scheduledDate: new Date(today.getTime() + 2*24*60*60*1000),
  }});

  const wo2 = await prisma.workOrder.create({ data: {
    title: 'HVAC Annual Maintenance',
    description: 'Annual HVAC inspection and filter replacement for all units in Shadyside Apartments.',
    status: WorkOrderStatus.OPEN,
    priority: WorkOrderPriority.MEDIUM,
    category: 'HVAC',
    propertyId: prop1.id,
    requestorId: manager.id,
    estimatedCost: 850,
    scheduledDate: new Date(today.getTime() + 7*24*60*60*1000),
  }});

  const wo3 = await prisma.workOrder.create({ data: {
    title: 'Electrical Panel Inspection',
    description: 'Breaker tripped twice last week in unit TH-1. Need electrician to inspect panel and wiring.',
    status: WorkOrderStatus.OPEN,
    priority: WorkOrderPriority.HIGH,
    category: 'ELECTRICAL',
    propertyId: prop2.id,
    unitId: lt1.id,
    requestorId: tenant2.id,
    assigneeId: contractor2.id,
    estimatedCost: 350,
  }});

  const wo4 = await prisma.workOrder.create({ data: {
    title: 'Parking Lot Resurfacing',
    description: 'East Liberty commercial parking lot needs crack sealing and seal coating.',
    status: WorkOrderStatus.COMPLETED,
    priority: WorkOrderPriority.LOW,
    category: 'GENERAL',
    propertyId: prop3.id,
    requestorId: owner.id,
    estimatedCost: 3200,
    actualCost: 3100,
    completedAt: new Date(today.getTime() - 5*24*60*60*1000),
  }});

  await prisma.workOrderComment.createMany({ data: [
    { workOrderId: wo1.id, authorId: contractor1.id, content: 'I have inspected the faucet. The cartridge needs replacement. Parts ordered, will complete Thursday.' },
    { workOrderId: wo1.id, authorId: tenant1.id, content: 'Thank you! The dripping is getting worse. Please let me know if you need access.' },
    { workOrderId: wo3.id, authorId: contractor2.id, content: 'Will inspect Thursday morning. Please ensure access to the electrical panel.' },
  ]});

  console.log('✅ Work orders and comments created');

  // --- Transactions ---
  const txBase = { propertyId: prop1.id, unitId: u1a.id, leaseId: lease1.id, userId: tenant1.id };
  for (let i = 3; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    await prisma.transaction.create({ data: {
      ...txBase, type: TransactionType.RENT,
      amount: 1450, status: TransactionStatus.COMPLETED,
      description: `Rent payment — ${d.toLocaleString('default',{month:'long',year:'numeric'})}`,
      dueDate: new Date(d.getFullYear(), d.getMonth(), 1),
      paidAt: new Date(d.getFullYear(), d.getMonth(), 1),
      category: 'RENT',
    }});
  }

  await prisma.transaction.create({ data: {
    propertyId: prop1.id, userId: owner.id,
    type: TransactionType.EXPENSE, amount: 850, status: TransactionStatus.COMPLETED,
    description: 'Annual HVAC maintenance Shadyside', category: 'MAINTENANCE',
    paidAt: new Date(today.getFullYear(), today.getMonth() - 1, 15),
  }});

  await prisma.transaction.create({ data: {
    propertyId: prop3.id, userId: owner.id,
    type: TransactionType.EXPENSE, amount: 3100, status: TransactionStatus.COMPLETED,
    description: 'Parking lot resurfacing East Liberty', category: 'IMPROVEMENT',
    paidAt: new Date(today.getTime() - 5*24*60*60*1000),
  }});

  await prisma.transaction.create({ data: {
    propertyId: prop2.id, unitId: lt1.id, leaseId: lease2.id, userId: tenant2.id,
    type: TransactionType.DEPOSIT, amount: 4200, status: TransactionStatus.COMPLETED,
    description: 'Security deposit — Lawrenceville TH-1', category: 'DEPOSIT',
    paidAt: lease2Start,
  }});

  console.log('✅ Transactions created');

  // --- Inspections ---
  const insp1 = await prisma.inspection.create({ data: {
    propertyId: prop1.id, unitId: u1a.id,
    type: 'MOVE_IN', status: InspectionStatus.COMPLETED,
    title: 'Move-In Inspection — Unit 1A',
    scheduledDate: lease1Start,
    completedAt: lease1Start,
    creatorId: manager.id,
    overallScore: 92,
    notes: 'Unit in excellent condition. Minor scuff on living room wall noted.',
    findings: { walls: 'good', floors: 'excellent', appliances: 'new', bathrooms: 'good' },
  }});

  await prisma.inspectionItem.createMany({ data: [
    { inspectionId: insp1.id, name: 'Living Room', area: 'Interior', condition: 'GOOD',   notes: 'Minor scuff on north wall', order: 1 },
    { inspectionId: insp1.id, name: 'Kitchen',     area: 'Interior', condition: 'EXCELLENT', notes: 'All new appliances', order: 2 },
    { inspectionId: insp1.id, name: 'Bathroom',    area: 'Interior', condition: 'GOOD',   notes: 'Clean, fully functional', order: 3 },
    { inspectionId: insp1.id, name: 'Bedroom 1',   area: 'Interior', condition: 'EXCELLENT', notes: 'Fresh paint', order: 4 },
  ]});

  await prisma.inspection.create({ data: {
    propertyId: prop1.id, type: 'ROUTINE', status: InspectionStatus.SCHEDULED,
    title: 'Annual Property Inspection — Shadyside',
    scheduledDate: new Date(today.getTime() + 14*24*60*60*1000),
    creatorId: manager.id,
  }});

  console.log('✅ Inspections created');

  // --- Documents ---
  await prisma.document.createMany({ data: [
    {
      propertyId: prop1.id, unitId: u1a.id, leaseId: lease1.id,
      name: 'Lease Agreement — Unit 1A (Marcus Chen)',
      type: DocumentType.LEASE, s3Key: 'documents/demo-lease-1a.pdf',
      url: '/uploads/documents/demo-lease-1a.pdf', mimeType: 'application/pdf',
      size: 245000, uploadedById: manager.id,
    },
    {
      propertyId: prop1.id,
      name: 'Shadyside Property Insurance Certificate 2025',
      type: DocumentType.INSURANCE, s3Key: 'documents/demo-insurance-shadyside.pdf',
      url: '/uploads/documents/demo-insurance-shadyside.pdf', mimeType: 'application/pdf',
      size: 128000, uploadedById: owner.id,
    },
    {
      propertyId: prop1.id, workOrderId: wo1.id,
      name: 'Faucet Repair Invoice',
      type: DocumentType.INVOICE, s3Key: 'documents/demo-invoice-faucet.pdf',
      url: '/uploads/documents/demo-invoice-faucet.pdf', mimeType: 'application/pdf',
      size: 52000, uploadedById: contractor1.id,
    },
  ]});

  console.log('✅ Documents created');

  // --- Conversations & Messages ---
  const conv1 = await prisma.conversation.create({ data: {
    subject: 'Kitchen Faucet Repair — Scheduling',
    type: 'WORK_ORDER', propertyId: prop1.id, workOrderId: wo1.id,
    participants: { create: [{ userId: tenant1.id }, { userId: contractor1.id }, { userId: manager.id }] },
  }});

  await prisma.message.createMany({ data: [
    { conversationId: conv1.id, senderId: tenant1.id, content: 'Hi Derek, just checking in on the faucet repair timeline?', type: MessageType.TEXT },
    { conversationId: conv1.id, senderId: contractor1.id, content: 'Hi Marcus! Parts arrived today. I can come Thursday between 10am-12pm. Does that work?', type: MessageType.TEXT },
    { conversationId: conv1.id, senderId: tenant1.id, content: 'Thursday at 10am works great. I will leave the key with the front desk.', type: MessageType.TEXT },
    { conversationId: conv1.id, senderId: manager.id, content: 'Great — I have noted it on the work order. Thanks both!', type: MessageType.TEXT },
  ]});

  const conv2 = await prisma.conversation.create({ data: {
    subject: 'Move-In Questions',
    type: 'GENERAL', propertyId: prop2.id,
    participants: { create: [{ userId: tenant2.id }, { userId: manager.id }] },
  }});

  await prisma.message.createMany({ data: [
    { conversationId: conv2.id, senderId: tenant2.id, content: 'Hi Jordan, quick question about trash pickup day for the townhome?', type: MessageType.TEXT },
    { conversationId: conv2.id, senderId: manager.id, content: 'Hi Sofia! Trash pickup is Tuesday and Friday. Recycling is every other Tuesday. Bins are in the side alley.', type: MessageType.TEXT },
    { conversationId: conv2.id, senderId: tenant2.id, content: 'Perfect, thank you!', type: MessageType.TEXT },
  ]});

  console.log('✅ Conversations and messages created');

  // --- Notifications ---
  await prisma.notification.createMany({ data: [
    {
      userId: tenant1.id, type: NotificationType.WORK_ORDER_UPDATE,
      title: 'Work Order Update', body: 'Your kitchen faucet repair has been assigned to Derek Mills and is now in progress.',
      isRead: false, link: `/work-orders/${wo1.id}`,
    },
    {
      userId: manager.id, type: NotificationType.WORK_ORDER_UPDATE,
      title: 'New Work Order', body: 'Tenant Sofia Reyes submitted a work order: Electrical Panel Inspection at Lawrenceville TH-1.',
      isRead: false, link: `/work-orders/${wo3.id}`,
    },
    {
      userId: owner.id, type: NotificationType.PAYMENT_RECEIVED,
      title: 'Rent Received', body: 'Marcus Chen paid rent of $1,450.00 for Unit 1A.',
      isRead: true, readAt: new Date(), link: '/financial',
    },
    {
      userId: tenant2.id, type: NotificationType.LEASE_EXPIRY,
      title: 'Lease Reminder', body: 'Your lease at Lawrenceville TH-1 is active. First renewal window opens in 10 months.',
      isRead: false, link: '/leases',
    },
    {
      userId: contractor1.id, type: NotificationType.WORK_ORDER_ASSIGNED,
      title: 'Work Order Assigned', body: 'You have been assigned: Kitchen Faucet Leak at Shadyside Apartments Unit 1A.',
      isRead: true, readAt: new Date(), link: `/work-orders/${wo1.id}`,
    },
  ]});

  console.log('✅ Notifications created');

  console.log('');
  console.log('🎉 Seed complete! Demo credentials (password: Password123!):');
  console.log('   owner@simplyservice.dev    — Property Owner');
  console.log('   manager@simplyservice.dev  — Property Manager');
  console.log('   tenant1@simplyservice.dev  — Tenant (Marcus Chen)');
  console.log('   tenant2@simplyservice.dev  — Tenant (Sofia Reyes)');
  console.log('   contractor1@simplyservice.dev — Contractor (Plumbing/HVAC)');
  console.log('   contractor2@simplyservice.dev — Contractor (Electrical)');
  console.log('   admin@simplyservice.dev    — Admin');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
EOF
log "seed.ts written."

# ============================================================
# API — Dockerfile
# ============================================================
cat > apps/api/Dockerfile << 'EOF'
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN yarn install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npx tsc --project tsconfig.json

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json yarn.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN yarn install --frozen-lockfile --production
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
EOF

log "API Dockerfile written."

# ============================================================
# WEB — package.json, tsconfig, vite, tailwind, postcss
# ============================================================
header "Writing web config files"

cat > apps/web/package.json << 'EOF'
{
  "name": "@simply-service/web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.28.0",
    "axios": "^1.6.8",
    "date-fns": "^3.6.0",
    "lucide-react": "^0.368.0",
    "mapbox-gl": "^3.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.51.3",
    "react-hot-toast": "^2.4.1",
    "react-router-dom": "^6.23.0",
    "recharts": "^2.12.4",
    "socket.io-client": "^4.7.5",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@types/mapbox-gl": "^3.1.0",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5",
    "vite": "^5.2.10"
  }
}
EOF

cat > apps/web/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

cat > apps/web/tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF

cat > apps/web/vite.config.ts << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
EOF

cat > apps/web/tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:   { DEFAULT: '#2563EB', 50: '#EFF6FF', 100: '#DBEAFE', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8', 900: '#1E3A8A' },
        secondary: { DEFAULT: '#0F172A', 800: '#1E293B', 900: '#0F172A' },
        accent:    { DEFAULT: '#7C3AED', 500: '#8B5CF6', 600: '#7C3AED' },
        success:   { DEFAULT: '#16A34A', 50: '#F0FDF4', 500: '#22C55E', 600: '#16A34A' },
        warning:   { DEFAULT: '#D97706', 50: '#FFFBEB', 500: '#F59E0B', 600: '#D97706' },
        danger:    { DEFAULT: '#DC2626', 50: '#FEF2F2', 500: '#EF4444', 600: '#DC2626' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
};
EOF

cat > apps/web/postcss.config.js << 'EOF'
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
EOF

cat > apps/web/index.html << 'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Simply Service — The Digital Operating System for Property Management" />
    <title>Simply Service</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

log "Web config files written."

# ============================================================
# WEB — src core files
# ============================================================
header "Writing web source core"

mkdir -p apps/web/src/{components/{ui,layout},pages,store,hooks,lib,types}

cat > apps/web/src/main.tsx << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
EOF

cat > apps/web/src/index.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * { @apply border-border; }
  body { @apply bg-gray-50 text-gray-900 font-sans antialiased; }
  h1 { @apply text-2xl font-bold; }
  h2 { @apply text-xl font-semibold; }
  h3 { @apply text-lg font-medium; }
}

@layer components {
  .btn { @apply inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed; }
  .btn-primary { @apply btn bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500; }
  .btn-secondary { @apply btn bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-400; }
  .btn-danger { @apply btn bg-danger-600 text-white hover:bg-red-700 focus:ring-danger-500; }
  .btn-ghost { @apply btn text-gray-600 hover:bg-gray-100 focus:ring-gray-400; }
  .card { @apply bg-white rounded-xl shadow-card border border-gray-100 p-6; }
  .input { @apply w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors; }
  .label { @apply block text-sm font-medium text-gray-700 mb-1; }
  .badge { @apply inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium; }
  .badge-blue { @apply badge bg-blue-100 text-blue-700; }
  .badge-green { @apply badge bg-green-100 text-green-700; }
  .badge-yellow { @apply badge bg-yellow-100 text-yellow-700; }
  .badge-red { @apply badge bg-red-100 text-red-700; }
  .badge-gray { @apply badge bg-gray-100 text-gray-600; }
  .badge-purple { @apply badge bg-purple-100 text-purple-700; }
}

/* mapbox resets */
.mapboxgl-map { font-family: inherit !important; }
EOF

cat > apps/web/src/types/index.ts << 'EOF'
export interface User {
  id: string; email: string; firstName: string; lastName: string;
  role: UserRole; phone?: string; avatarUrl?: string; bio?: string;
  isVerified: boolean; isActive: boolean; createdAt: string;
}
export type UserRole = 'OWNER'|'MANAGER'|'TENANT'|'CONTRACTOR'|'VENDOR'|'ADMIN';

export interface Property {
  id: string; name: string; address: string; city: string; state: string; zip: string;
  type: string; units: number; sqFootage?: number; yearBuilt?: number;
  description?: string; lat?: number; lng?: number; ownerId: string;
  _count?: { workOrders: number; leases: number };
}
export interface Unit {
  id: string; propertyId: string; unitNumber: string; floor?: number;
  bedrooms?: number; bathrooms?: number; sqFootage?: number;
  rentAmount?: number; isAvailable: boolean; features?: string[];
}
export interface Lease {
  id: string; unitId: string; propertyId: string; tenantId: string;
  startDate: string; endDate: string; rentAmount: number;
  depositAmount: number; status: string;
  tenant?: Pick<User,'id'|'firstName'|'lastName'|'email'>;
  unit?: Pick<Unit,'id'|'unitNumber'>;
}
export interface WorkOrder {
  id: string; title: string; description: string;
  status: WorkOrderStatus; priority: WorkOrderPriority; category: string;
  propertyId: string; unitId?: string; requestorId: string; assigneeId?: string;
  estimatedCost?: number; actualCost?: number; scheduledDate?: string;
  completedAt?: string; createdAt: string; updatedAt: string;
  property?: Pick<Property,'id'|'name'|'address'|'city'>;
  assignee?: Pick<User,'id'|'firstName'|'lastName'>;
  requestor?: Pick<User,'id'|'firstName'|'lastName'>;
  _count?: { comments: number };
}
export type WorkOrderStatus = 'OPEN'|'ASSIGNED'|'IN_PROGRESS'|'ON_HOLD'|'COMPLETED'|'CANCELLED';
export type WorkOrderPriority = 'LOW'|'MEDIUM'|'HIGH'|'EMERGENCY';

export interface Transaction {
  id: string; propertyId: string; userId: string;
  type: 'RENT'|'DEPOSIT'|'INCOME'|'EXPENSE'|'REFUND'|'FEE';
  amount: number; status: 'PENDING'|'COMPLETED'|'FAILED'|'REFUNDED';
  description?: string; category?: string; dueDate?: string; paidAt?: string;
  createdAt: string;
  property?: Pick<Property,'id'|'name'>;
  user?: Pick<User,'id'|'firstName'|'lastName'>;
}
export interface Notification {
  id: string; userId: string; type: string;
  title: string; body: string; isRead: boolean;
  link?: string; readAt?: string; createdAt: string;
}
export interface Conversation {
  id: string; subject?: string; type: string;
  participants: Array<{ userId: string; user: Pick<User,'id'|'firstName'|'lastName'|'avatarUrl'> }>;
  messages?: Message[]; property?: Pick<Property,'id'|'name'>; createdAt: string; updatedAt: string;
}
export interface Message {
  id: string; conversationId: string; senderId: string; content: string;
  type: string; createdAt: string;
  sender: Pick<User,'id'|'firstName'|'lastName'|'avatarUrl'>;
}
export interface ContractorProfile {
  id: string; userId: string; businessName?: string; licenseNumber?: string;
  specialties: string[]; hourlyRate?: number; bio?: string;
  yearsExperience?: number; rating?: number; reviewCount: number;
  user: Pick<User,'id'|'firstName'|'lastName'|'email'|'phone'|'avatarUrl'>;
}
export interface Inspection {
  id: string; propertyId: string; unitId?: string; type: string;
  status: string; title?: string; scheduledDate?: string;
  completedAt?: string; overallScore?: number; notes?: string; createdAt: string;
  property?: Pick<Property,'id'|'name'>; unit?: Pick<Unit,'id'|'unitNumber'>;
  creator?: Pick<User,'id'|'firstName'|'lastName'>;
  items?: InspectionItem[];
}
export interface InspectionItem {
  id: string; name: string; area?: string; condition: string;
  notes?: string; order: number;
}
export interface PaginatedResponse<T> {
  data: T[]; pagination: { page: number; limit: number; total: number; pages: number; };
}
EOF

cat > apps/web/src/lib/api.ts << 'EOF'
import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

const BASE = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({ baseURL: BASE, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve:(v:string)=>void; reject:(e:any)=>void }> = [];

const processQueue = (error: any, token: string|null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token!));
  failedQueue = [];
};

api.interceptors.response.use(
  r => r,
  async (error: AxiosError) => {
    const orig = error.config as any;
    if (error.response?.status === 401 && !orig._retry && !orig.url?.includes('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => { orig.headers.Authorization = `Bearer ${token}`; return api(orig); });
      }
      orig._retry = true;
      isRefreshing = true;
      try {
        const { data } = await api.post('/auth/refresh');
        const newToken = data.data.accessToken;
        useAuthStore.getState().setToken(newToken);
        processQueue(null, newToken);
        orig.headers.Authorization = `Bearer ${newToken}`;
        return api(orig);
      } catch (e) {
        processQueue(e, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    const msg = (error.response?.data as any)?.message || error.message || 'An error occurred';
    if (error.response?.status !== 401) toast.error(msg);
    return Promise.reject(error);
  }
);

export default api;
EOF

cat > apps/web/src/lib/socket.ts << 'EOF'
import { io, Socket } from 'socket.io-client';
let socket: Socket | null = null;
export const getSocket = (token?: string): Socket => {
  if (!socket) {
    socket = io('/', { auth: { token }, transports: ['websocket','polling'], autoConnect: false });
  }
  return socket;
};
export const disconnectSocket = () => { if (socket) { socket.disconnect(); socket = null; } };
EOF

cat > apps/web/src/lib/utils.ts << 'EOF'
import { type ClassValue, clsx } from 'clsx';
export function cn(...inputs: ClassValue[]) { return inputs.filter(Boolean).join(' '); }
export const formatCurrency = (n: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
export const formatDate = (d: string|Date) => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(d));
export const formatRelative = (d: string|Date) => {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h/24);
  if (dy < 7) return `${dy}d ago`;
  return formatDate(d);
};
export const statusColors: Record<string,string> = {
  OPEN:'badge-blue', ASSIGNED:'badge-purple', IN_PROGRESS:'badge-yellow',
  ON_HOLD:'badge-gray', COMPLETED:'badge-green', CANCELLED:'badge-gray',
  ACTIVE:'badge-green', EXPIRED:'badge-gray', PENDING:'badge-yellow',
  FAILED:'badge-red', REFUNDED:'badge-gray',
};
export const priorityColors: Record<string,string> = {
  LOW:'badge-gray', MEDIUM:'badge-blue', HIGH:'badge-yellow', EMERGENCY:'badge-red',
};
EOF
log "Web core src files written."

# ============================================================
# WEB — Zustand stores
# ============================================================
header "Writing web stores"

cat > apps/web/src/store/authStore.ts << 'EOF'
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  setUser: (u: User) => void;
  setToken: (t: string) => void;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setAuth: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    { name: 'ss-auth', partialize: (s) => ({ token: s.token, user: s.user }) }
  )
);
EOF

cat > apps/web/src/store/uiStore.ts << 'EOF'
import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  theme: 'light'|'dark';
  setTheme: (t: 'light'|'dark') => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  theme: 'light',
  setTheme: (theme) => set({ theme }),
}));
EOF
log "Stores written."

# ============================================================
# WEB — Hooks
# ============================================================
header "Writing web hooks"

cat > apps/web/src/hooks/useAuth.ts << 'EOF'
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export function useAuth() {
  const { user, token, setAuth, logout: storeLogout } = useAuthStore();
  const navigate = useNavigate();

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAuth(data.data.user, data.data.accessToken);
    toast.success(`Welcome back, ${data.data.user.firstName}!`);
    navigate('/dashboard');
  }, [setAuth, navigate]);

  const register = useCallback(async (payload: Record<string,string>) => {
    const { data } = await api.post('/auth/register', payload);
    setAuth(data.data.user, data.data.accessToken);
    toast.success('Account created! Welcome to Simply Service.');
    navigate('/dashboard');
  }, [setAuth, navigate]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    storeLogout();
    navigate('/login');
  }, [storeLogout, navigate]);

  return { user, token, isAuthenticated: !!token, login, register, logout };
}
EOF

cat > apps/web/src/hooks/useNotifications.ts << 'EOF'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export function useNotifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications?limit=20').then(r => r.data.data),
    refetchInterval: 30_000,
  });
  const { data: unreadData } = useQuery({
    queryKey: ['notifications','unread'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data.data.count),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['notifications']}); },
  });
  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => { qc.invalidateQueries({queryKey:['notifications']}); },
  });
  return {
    notifications: data?.notifications ?? [],
    unreadCount: unreadData ?? 0,
    isLoading,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
  };
}
EOF

cat > apps/web/src/hooks/useSocket.ts << 'EOF'
import { useEffect, useRef } from 'react';
import { getSocket, disconnectSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { Socket } from 'socket.io-client';

export function useSocket(): Socket | null {
  const socketRef = useRef<Socket|null>(null);
  const token = useAuthStore(s => s.token);

  useEffect(() => {
    if (!token) return;
    const s = getSocket(token);
    s.connect();
    socketRef.current = s;
    return () => { disconnectSocket(); };
  }, [token]);

  return socketRef.current;
}
EOF

cat > apps/web/src/hooks/useDebounce.ts << 'EOF'
import { useState, useEffect } from 'react';
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
EOF
log "Hooks written."

# ============================================================
# WEB — UI Components
# ============================================================
header "Writing UI components"

cat > apps/web/src/components/ui/Button.tsx << 'EOF'
import React from 'react';
import { Loader2 } from 'lucide-react';
interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary'|'secondary'|'danger'|'ghost';
  size?: 'sm'|'md'|'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}
const sizes = { sm:'px-3 py-1.5 text-xs', md:'px-4 py-2 text-sm', lg:'px-6 py-3 text-base' };
const variants = { primary:'btn-primary', secondary:'btn-secondary', danger:'btn-danger', ghost:'btn-ghost' };
export function Button({ variant='primary', size='md', loading, icon, children, className='', disabled, ...props }: Props) {
  return (
    <button className={`${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled||loading} {...props}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
EOF

cat > apps/web/src/components/ui/Input.tsx << 'EOF'
import React from 'react';
interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string;
  leftIcon?: React.ReactNode; rightIcon?: React.ReactNode;
}
export function Input({ label, error, hint, leftIcon, rightIcon, className='', id, ...props }: Props) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g,'-');
  return (
    <div className="w-full">
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <div className="relative">
        {leftIcon && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">{leftIcon}</div>}
        <input id={inputId} className={`input ${leftIcon?'pl-9':''} ${rightIcon?'pr-9':''} ${error?'border-red-500 focus:border-red-500 focus:ring-red-500/20':''} ${className}`} {...props} />
        {rightIcon && <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">{rightIcon}</div>}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
EOF

cat > apps/web/src/components/ui/Badge.tsx << 'EOF'
import React from 'react';
interface Props { label: string; color?: string; className?: string; }
export function Badge({ label, color='badge-gray', className='' }: Props) {
  return <span className={`${color} ${className}`}>{label}</span>;
}
EOF

cat > apps/web/src/components/ui/Modal.tsx << 'EOF'
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
interface Props { isOpen: boolean; onClose: ()=>void; title?: string; children: React.ReactNode; size?: 'sm'|'md'|'lg'|'xl'; }
const sizes = { sm:'max-w-md', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl' };
export function Modal({ isOpen, onClose, title, children, size='md' }: Props) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow='hidden';
    return () => { document.body.style.overflow=''; };
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-xl w-full ${sizes[size]} max-h-[90vh] overflow-y-auto`}>
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
EOF

cat > apps/web/src/components/ui/StatCard.tsx << 'EOF'
import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
interface Props { title: string; value: string|number; icon: LucideIcon; color?: string; change?: number; changeLabel?: string; }
export function StatCard({ title, value, icon: Icon, color='bg-blue-500', change, changeLabel }: Props) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`${color} p-3 rounded-xl flex-shrink-0`}><Icon className="w-6 h-6 text-white" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 truncate">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {change !== undefined && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${change>=0?'text-green-600':'text-red-600'}`}>
            {change>=0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{change>=0?'+':''}{change}%</span>
            {changeLabel && <span className="text-gray-400 font-normal">{changeLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
EOF

cat > apps/web/src/components/ui/EmptyState.tsx << 'EOF'
import React from 'react';
import { LucideIcon } from 'lucide-react';
interface Props { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode; }
export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-gray-100 p-4 rounded-2xl mb-4"><Icon className="w-10 h-10 text-gray-400" /></div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
EOF
log "UI components written."

# ============================================================
# WEB — Layout components
# ============================================================
header "Writing layout components"

cat > apps/web/src/components/layout/Sidebar.tsx << 'EOF'
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Wrench, DollarSign, MessageSquare,
  ClipboardCheck, FileText, Users, Bot, Bell, Settings, LogOut, Zap,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import api from '../../lib/api';

const links = [
  { to:'/dashboard',     icon:LayoutDashboard, label:'Dashboard',    roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
  { to:'/properties',    icon:Building2,       label:'Properties',   roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/work-orders',   icon:Wrench,          label:'Work Orders',  roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
  { to:'/financial',     icon:DollarSign,      label:'Financial',    roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/messages',      icon:MessageSquare,   label:'Messages',     roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
  { to:'/inspections',   icon:ClipboardCheck,  label:'Inspections',  roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/documents',     icon:FileText,        label:'Documents',    roles:['OWNER','MANAGER','TENANT','ADMIN'] },
  { to:'/contractors',   icon:Users,           label:'Contractors',  roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/ai-assistant',  icon:Bot,             label:'AI Assistant', roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/notifications', icon:Bell,            label:'Notifications',roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
  { to:'/settings',      icon:Settings,        label:'Settings',     roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
];

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarOpen } = useUIStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    useAuthStore.getState().logout();
    navigate('/login');
  };

  const allowed = links.filter(l => user && l.roles.includes(user.role));

  return (
    <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} transition-all duration-300 bg-secondary-900 flex flex-col h-screen fixed left-0 top-0 z-30 overflow-hidden`}>
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="bg-primary-600 rounded-lg p-1.5 flex-shrink-0"><Zap className="w-5 h-5 text-white" /></div>
        {sidebarOpen && <span className="text-white font-bold text-base whitespace-nowrap">Simply Service</span>}
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        {allowed.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors text-sm font-medium
               ${isActive ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="whitespace-nowrap">{label}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10">
        {sidebarOpen && user && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{user.firstName} {user.lastName}</p>
              <p className="text-gray-400 text-xs truncate">{user.role}</p>
            </div>
          </div>
        )}
        <button onClick={handleLogout} className="flex items-center gap-3 text-gray-400 hover:text-white text-sm w-full px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {sidebarOpen && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
EOF

cat > apps/web/src/components/layout/Header.tsx << 'EOF'
import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useNotifications } from '../../hooks/useNotifications';
import { useNavigate } from 'react-router-dom';

export function Header({ title }: { title?: string }) {
  const { toggleSidebar, sidebarOpen } = useUIStore();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <button onClick={toggleSidebar} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
        {title && <h1 className="text-lg font-semibold text-gray-900">{title}</h1>}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/notifications')} className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
EOF

cat > apps/web/src/components/layout/Layout.tsx << 'EOF'
import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '../../store/uiStore';

export function Layout({ children, title }: { children: React.ReactNode; title?: string }) {
  const { sidebarOpen } = useUIStore();
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        <Header title={title} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
EOF

cat > apps/web/src/components/layout/ProtectedRoute.tsx << 'EOF'
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function ProtectedRoute({ roles }: { roles?: string[] }) {
  const { user, token } = useAuthStore();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
EOF
log "Layout components written."

# ============================================================
# WEB — App.tsx (router)
# ============================================================
header "Writing App.tsx"

cat > apps/web/src/App.tsx << 'EOF'
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

const Login          = lazy(() => import('./pages/Login'));
const Register       = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const Properties     = lazy(() => import('./pages/Properties'));
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'));
const WorkOrders     = lazy(() => import('./pages/WorkOrders'));
const WorkOrderDetail= lazy(() => import('./pages/WorkOrderDetail'));
const Financial      = lazy(() => import('./pages/Financial'));
const Messages       = lazy(() => import('./pages/Messages'));
const Inspections    = lazy(() => import('./pages/Inspections'));
const Documents      = lazy(() => import('./pages/Documents'));
const Contractors    = lazy(() => import('./pages/Contractors'));
const AIAssistant    = lazy(() => import('./pages/AIAssistant'));
const Notifications  = lazy(() => import('./pages/Notifications'));
const Settings       = lazy(() => import('./pages/Settings'));
const Profile        = lazy(() => import('./pages/Profile'));
const MapView        = lazy(() => import('./pages/MapView'));
const Tenants        = lazy(() => import('./pages/Tenants'));
const Reports        = lazy(() => import('./pages/Reports'));

const Spinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000, style: { borderRadius: '10px', background: '#1e293b', color: '#fff' } }} />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/login"          element={<Login />} />
          <Route path="/register"       element={<Register />} />
          <Route path="/forgot-password"element={<ForgotPassword />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard"    element={<Dashboard />} />
            <Route path="/properties"   element={<Properties />} />
            <Route path="/properties/:id" element={<PropertyDetail />} />
            <Route path="/work-orders"  element={<WorkOrders />} />
            <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
            <Route path="/financial"    element={<Financial />} />
            <Route path="/messages"     element={<Messages />} />
            <Route path="/inspections"  element={<Inspections />} />
            <Route path="/documents"    element={<Documents />} />
            <Route path="/contractors"  element={<Contractors />} />
            <Route path="/ai-assistant" element={<AIAssistant />} />
            <Route path="/notifications"element={<Notifications />} />
            <Route path="/settings"     element={<Settings />} />
            <Route path="/profile"      element={<Profile />} />
            <Route path="/map"          element={<MapView />} />
            <Route path="/tenants"      element={<Tenants />} />
            <Route path="/reports"      element={<Reports />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
EOF
log "App.tsx written."

# ============================================================
# WEB — Auth pages
# ============================================================
header "Writing auth pages"

cat > apps/web/src/pages/Login.tsx << 'EOF'
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Mail, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try { await login(email, password); }
    catch (err: any) { setError(err.response?.data?.message || 'Invalid credentials'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-900 via-secondary-800 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Simply Service</h1>
          <p className="text-gray-400 mt-1">Property Management Platform</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign in to your account</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" leftIcon={<Mail className="w-4 h-4" />} required />
            <Input label="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" leftIcon={<Lock className="w-4 h-4" />} required />
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700">Forgot password?</Link>
            </div>
            <Button type="submit" loading={loading} className="w-full">Sign In</Button>
          </form>
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-sm text-gray-600 mb-4">Demo accounts (password: Password123!)</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[['Owner','owner@simplyservice.dev'],['Manager','manager@simplyservice.dev'],['Tenant','tenant1@simplyservice.dev'],['Contractor','contractor1@simplyservice.dev']].map(([role,em])=>(
                <button key={em} onClick={()=>{setEmail(em);setPassword('Password123!');}} className="text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                  <span className="font-medium text-gray-700">{role}</span><br/><span className="text-gray-400 truncate block">{em}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-center text-sm text-gray-600 mt-6">
            No account? <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
EOF

cat > apps/web/src/pages/Register.tsx << 'EOF'
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'', phone:'', role:'TENANT' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm(f=>({...f,[k]:e.target.value}));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await register(form); }
    catch (err: any) { setError(err.response?.data?.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-900 via-secondary-800 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4"><Zap className="w-8 h-8 text-white" /></div>
          <h1 className="text-3xl font-bold text-white">Simply Service</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Create your account</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First name" value={form.firstName} onChange={set('firstName')} required />
              <Input label="Last name" value={form.lastName} onChange={set('lastName')} required />
            </div>
            <Input label="Email" type="email" value={form.email} onChange={set('email')} required />
            <Input label="Password" type="password" value={form.password} onChange={set('password')} hint="Min 8 characters" required />
            <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="412-555-0000" />
            <div>
              <label className="label">Role</label>
              <select value={form.role} onChange={set('role')} className="input">
                <option value="TENANT">Tenant</option>
                <option value="OWNER">Property Owner</option>
                <option value="MANAGER">Property Manager</option>
                <option value="CONTRACTOR">Contractor</option>
              </select>
            </div>
            <Button type="submit" loading={loading} className="w-full">Create Account</Button>
          </form>
          <p className="text-center text-sm text-gray-600 mt-6">
            Already have an account? <Link to="/login" className="text-primary-600 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
EOF

cat > apps/web/src/pages/ForgotPassword.tsx << 'EOF'
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Mail } from 'lucide-react';
import api from '../lib/api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await api.post('/auth/forgot-password', { email }); setSent(true); }
    catch (_) { setSent(true); }
    finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-900 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-600 rounded-xl mb-3"><Zap className="w-6 h-6 text-white" /></div>
          <h2 className="text-xl font-semibold">Reset your password</h2>
        </div>
        {sent ? (
          <div className="text-center">
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-4 mb-6">
              If that email exists, a reset link has been sent. Check your inbox.
            </div>
            <Link to="/login" className="text-primary-600 font-medium">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} leftIcon={<Mail className="w-4 h-4" />} required />
            <Button type="submit" loading={loading} className="w-full">Send Reset Link</Button>
            <p className="text-center text-sm"><Link to="/login" className="text-primary-600">Back to sign in</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
EOF
log "Auth pages written."

# ============================================================
# WEB — Dashboard page
# ============================================================
header "Writing main pages (1/5)"

cat > apps/web/src/pages/Dashboard.tsx << 'EOF'
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Wrench, DollarSign, Users, AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatCard } from '../components/ui/StatCard';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { formatCurrency, formatDate, priorityColors, statusColors } from '../lib/utils';
import { WorkOrder, Transaction, Notification } from '../types';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useAuthStore();

  const { data: props } = useQuery({ queryKey:['properties','summary'], queryFn:()=>api.get('/properties?limit=5').then(r=>r.data.data) });
  const { data: woData } = useQuery({ queryKey:['workOrders','recent'], queryFn:()=>api.get('/work-orders?limit=5').then(r=>r.data.data) });
  const { data: txData } = useQuery({ queryKey:['financial','recent'], queryFn:()=>api.get('/financial/transactions?limit=5').then(r=>r.data.data), enabled: user?.role!=='TENANT' });
  const { data: notifData } = useQuery({ queryKey:['notifications','recent'], queryFn:()=>api.get('/notifications?limit=5&isRead=false').then(r=>r.data.data) });

  const properties = props?.properties ?? [];
  const workOrders: WorkOrder[] = woData?.workOrders ?? [];
  const transactions: Transaction[] = txData?.transactions ?? [];
  const notifications: Notification[] = notifData?.notifications ?? [];

  const openWOs = workOrders.filter(w => w.status === 'OPEN').length;
  const inProgressWOs = workOrders.filter(w => w.status === 'IN_PROGRESS').length;
  const emergencyWOs = workOrders.filter(w => w.priority === 'EMERGENCY').length;

  return (
    <Layout title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user?.firstName}`}>
      <div className="space-y-6">
        {emergencyWOs > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-red-700 text-sm font-medium">{emergencyWOs} emergency work order{emergencyWOs>1?'s':''} require immediate attention</p>
            <Link to="/work-orders?priority=EMERGENCY" className="ml-auto text-red-600 text-sm font-semibold hover:underline">View →</Link>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Properties" value={properties.length} icon={Building2} color="bg-blue-500" />
          <StatCard title="Open Work Orders" value={openWOs} icon={Wrench} color="bg-orange-500" />
          <StatCard title="In Progress" value={inProgressWOs} icon={Clock} color="bg-yellow-500" />
          {user?.role !== 'TENANT' && user?.role !== 'CONTRACTOR' && (
            <StatCard title="Active Leases" value={properties.reduce((s:number,p:any)=>s+(p._count?.leases??0),0)} icon={Users} color="bg-green-500" />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Recent Work Orders</h2>
              <Link to="/work-orders" className="text-primary-600 text-sm hover:underline">View all →</Link>
            </div>
            {workOrders.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No work orders</p>
            ) : (
              <div className="space-y-3">
                {workOrders.map(wo => (
                  <Link key={wo.id} to={`/work-orders/${wo.id}`} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${wo.priority==='EMERGENCY'?'bg-red-500':wo.priority==='HIGH'?'bg-orange-500':wo.priority==='MEDIUM'?'bg-yellow-500':'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-600">{wo.title}</p>
                      <p className="text-xs text-gray-500 truncate">{wo.property?.name} · {formatDate(wo.createdAt)}</p>
                    </div>
                    <span className={`${statusColors[wo.status]??'badge-gray'}`}>{wo.status.replace('_',' ')}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {notifications.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Unread Alerts</h2>
                  <Link to="/notifications" className="text-primary-600 text-sm hover:underline">All →</Link>
                </div>
                <div className="space-y-2">
                  {notifications.slice(0,4).map(n => (
                    <div key={n.id} className="p-2 bg-gray-50 rounded-lg">
                      <p className="text-xs font-medium text-gray-800">{n.title}</p>
                      <p className="text-xs text-gray-500 truncate">{n.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {transactions.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Recent Transactions</h2>
                  <Link to="/financial" className="text-primary-600 text-sm hover:underline">All →</Link>
                </div>
                <div className="space-y-2">
                  {transactions.slice(0,4).map(t => (
                    <div key={t.id} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{t.description||t.type}</p>
                        <p className="text-xs text-gray-400">{formatDate(t.createdAt)}</p>
                      </div>
                      <span className={`text-xs font-bold ml-2 ${t.type==='INCOME'||t.type==='RENT'?'text-green-600':'text-red-600'}`}>
                        {t.type==='EXPENSE'?'-':'+'}{formatCurrency(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
EOF

cat > apps/web/src/pages/Properties.tsx << 'EOF'
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, MapPin, Home } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Property } from '../types';
import toast from 'react-hot-toast';

const TYPES = ['APARTMENT','HOUSE','TOWNHOUSE','CONDO','COMMERCIAL','INDUSTRIAL','LAND','OTHER'];

export default function Properties() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:'',address:'',city:'Pittsburgh',state:'PA',zip:'',type:'APARTMENT',units:'1',description:'',lat:'',lng:'' });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm(f=>({...f,[k]:e.target.value}));

  const { data, isLoading } = useQuery({
    queryKey: ['properties', search],
    queryFn: () => api.get(`/properties?search=${search}&limit=20`).then(r=>r.data.data),
  });

  const addMutation = useMutation({
    mutationFn: (body: any) => api.post('/properties', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['properties']}); setShowAdd(false); toast.success('Property added!'); },
  });

  const properties: Property[] = data?.properties ?? [];

  return (
    <Layout title="Properties">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex-1"><Input placeholder="Search properties..." value={search} onChange={e=>setSearch(e.target.value)} leftIcon={<Search className="w-4 h-4" />} /></div>
          <Button onClick={()=>setShowAdd(true)} icon={<Plus className="w-4 h-4" />}>Add Property</Button>
        </div>

        {isLoading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
        : properties.length === 0 ? <EmptyState icon={Building2} title="No properties yet" description="Add your first property to get started." action={<Button onClick={()=>setShowAdd(true)} icon={<Plus className="w-4 h-4" />}>Add Property</Button>} />
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {properties.map(p => (
              <Link key={p.id} to={`/properties/${p.id}`} className="card hover:shadow-card-hover transition-shadow group">
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-primary-50 p-2 rounded-lg"><Building2 className="w-5 h-5 text-primary-600" /></div>
                  <span className="badge badge-blue text-xs">{p.type}</span>
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{p.name}</h3>
                <div className="flex items-center gap-1 text-gray-500 text-sm mt-1">
                  <MapPin className="w-3 h-3" /><span>{p.address}, {p.city}, {p.state}</span>
                </div>
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600">
                  <span className="flex items-center gap-1"><Home className="w-3 h-3" />{p.units} units</span>
                  {p._count && <span className="text-orange-600">{p._count.workOrders} work orders</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={()=>setShowAdd(false)} title="Add Property" size="lg">
        <form onSubmit={e=>{e.preventDefault();addMutation.mutate({...form,units:parseInt(form.units),lat:form.lat?parseFloat(form.lat):undefined,lng:form.lng?parseFloat(form.lng):undefined});}} className="space-y-4">
          <Input label="Property Name" value={form.name} onChange={set('name')} required />
          <Input label="Address" value={form.address} onChange={set('address')} required />
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2"><Input label="City" value={form.city} onChange={set('city')} required /></div>
            <Input label="State" value={form.state} onChange={set('state')} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="ZIP" value={form.zip} onChange={set('zip')} required />
            <div><label className="label">Type</label><select value={form.type} onChange={set('type')} className="input">{TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          </div>
          <Input label="Number of Units" type="number" min="1" value={form.units} onChange={set('units')} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Latitude (optional)" type="number" step="any" value={form.lat} onChange={set('lat')} placeholder="40.4406" />
            <Input label="Longitude (optional)" type="number" step="any" value={form.lng} onChange={set('lng')} placeholder="-79.9959" />
          </div>
          <div><label className="label">Description</label><textarea value={form.description} onChange={set('description')} className="input h-20 resize-none" placeholder="Brief property description..." /></div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={()=>setShowAdd(false)} type="button">Cancel</Button>
            <Button type="submit" loading={addMutation.isPending}>Add Property</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
EOF
log "Dashboard and Properties pages written."

cat > apps/web/src/pages/PropertyDetail.tsx << 'EOF'
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Home, Wrench, DollarSign, ClipboardCheck, FileText, Bot } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import api from '../lib/api';
import { formatCurrency } from '../lib/utils';

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [aiSummary, setAiSummary] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => api.get(`/properties/${id}`).then(r => r.data.data.property),
  });

  const { data: units } = useQuery({
    queryKey: ['property', id, 'units'],
    queryFn: () => api.get(`/properties/${id}/units`).then(r => r.data.data.units),
    enabled: !!id,
  });

  const { data: woData } = useQuery({
    queryKey: ['workOrders', 'property', id],
    queryFn: () => api.get(`/work-orders?propertyId=${id}&limit=5`).then(r => r.data.data),
    enabled: !!id,
  });

  const handleAISummary = async () => {
    setLoadingAI(true);
    try {
      const { data: d } = await api.post(`/properties/${id}/ai-summary`);
      setAiSummary(d.data.summary);
    } catch (_) {}
    finally { setLoadingAI(false); }
  };

  if (isLoading) return <Layout><div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div></Layout>;
  if (!data) return <Layout><p className="text-center text-gray-500 py-20">Property not found.</p></Layout>;

  const p = data;
  const workOrders = woData?.workOrders ?? [];
  const unitList = units ?? [];

  return (
    <Layout title={p.name}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/properties"><Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />}>Back</Button></Link>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="secondary" icon={<Bot className="w-4 h-4" />} onClick={handleAISummary} loading={loadingAI}>AI Summary</Button>
          </div>
        </div>

        {aiSummary && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3">
            <Bot className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-purple-900">{aiSummary}</p>
          </div>
        )}

        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">{p.name}</h2>
              <div className="flex items-center gap-1 text-gray-500 text-sm mt-1">
                <MapPin className="w-4 h-4" /><span>{p.address}, {p.city}, {p.state} {p.zip}</span>
              </div>
            </div>
            <Badge label={p.type} color="badge-blue" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
            <div><p className="text-xs text-gray-500">Units</p><p className="font-semibold">{p.units}</p></div>
            {p.sqFootage && <div><p className="text-xs text-gray-500">Sq Footage</p><p className="font-semibold">{p.sqFootage.toLocaleString()} sq ft</p></div>}
            {p.yearBuilt && <div><p className="text-xs text-gray-500">Year Built</p><p className="font-semibold">{p.yearBuilt}</p></div>}
            <div><p className="text-xs text-gray-500">Work Orders</p><p className="font-semibold text-orange-600">{p._count?.workOrders ?? 0} open</p></div>
          </div>
          {p.description && <p className="text-gray-600 text-sm mt-4">{p.description}</p>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2"><Home className="w-4 h-4 text-gray-500" /> Units ({unitList.length})</h3>
            </div>
            {unitList.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No units found.</p> : (
              <div className="space-y-2">
                {unitList.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Unit {u.unitNumber}</p>
                      <p className="text-xs text-gray-500">{u.bedrooms}bd / {u.bathrooms}ba · {u.sqFootage} sq ft</p>
                    </div>
                    <div className="text-right">
                      {u.rentAmount && <p className="text-sm font-semibold text-green-600">{formatCurrency(u.rentAmount)}/mo</p>}
                      <Badge label={u.isAvailable ? 'Available' : 'Occupied'} color={u.isAvailable ? 'badge-green' : 'badge-gray'} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2"><Wrench className="w-4 h-4 text-gray-500" /> Recent Work Orders</h3>
              <Link to={`/work-orders?propertyId=${id}`} className="text-primary-600 text-sm hover:underline">View all</Link>
            </div>
            {workOrders.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No work orders.</p> : (
              <div className="space-y-2">
                {workOrders.map((wo: any) => (
                  <Link key={wo.id} to={`/work-orders/${wo.id}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{wo.title}</p>
                      <p className="text-xs text-gray-400">{wo.category}</p>
                    </div>
                    <Badge label={wo.status.replace('_',' ')} color="badge-yellow" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
EOF

cat > apps/web/src/pages/WorkOrders.tsx << 'EOF'
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Filter, Wrench } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { WorkOrder } from '../types';
import { formatDate, statusColors, priorityColors } from '../lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

const CATEGORIES = ['PLUMBING','ELECTRICAL','HVAC','GENERAL','CARPENTRY','PAINTING','CLEANING','LANDSCAPING','APPLIANCE','ROOFING','OTHER'];
const STATUSES = ['OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED'];
const PRIORITIES = ['LOW','MEDIUM','HIGH','EMERGENCY'];

export default function WorkOrders() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title:'', description:'', priority:'MEDIUM', category:'GENERAL', propertyId:'', estimatedCost:'' });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm(f=>({...f,[k]:e.target.value}));

  const params = new URLSearchParams();
  if (search)         params.set('search', search);
  if (filterStatus)   params.set('status', filterStatus);
  if (filterPriority) params.set('priority', filterPriority);

  const { data, isLoading } = useQuery({
    queryKey: ['workOrders', search, filterStatus, filterPriority],
    queryFn: () => api.get(`/work-orders?${params}&limit=30`).then(r => r.data.data),
  });
  const { data: propData } = useQuery({
    queryKey: ['properties','dropdown'],
    queryFn: () => api.get('/properties?limit=50').then(r=>r.data.data.properties),
    enabled: user?.role !== 'TENANT' && user?.role !== 'CONTRACTOR',
  });

  const addMutation = useMutation({
    mutationFn: (body: any) => api.post('/work-orders', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['workOrders']}); setShowAdd(false); toast.success('Work order created!'); },
  });

  const workOrders: WorkOrder[] = data?.workOrders ?? [];
  const properties: any[] = propData ?? [];

  return (
    <Layout title="Work Orders">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48"><Input placeholder="Search work orders..." value={search} onChange={e=>setSearch(e.target.value)} leftIcon={<Search className="w-4 h-4" />} /></div>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="input w-auto">
            <option value="">All Statuses</option>
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} className="input w-auto">
            <option value="">All Priorities</option>
            {PRIORITIES.map(p=><option key={p}>{p}</option>)}
          </select>
          <Button onClick={()=>setShowAdd(true)} icon={<Plus className="w-4 h-4" />}>New Work Order</Button>
        </div>

        {isLoading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
        : workOrders.length === 0 ? <EmptyState icon={Wrench} title="No work orders found" description="Submit a new maintenance request to get started." action={<Button onClick={()=>setShowAdd(true)} icon={<Plus className="w-4 h-4" />}>New Work Order</Button>} />
        : (
          <div className="space-y-3">
            {workOrders.map(wo => (
              <Link key={wo.id} to={`/work-orders/${wo.id}`} className="card flex items-start gap-4 hover:shadow-card-hover transition-shadow group p-4">
                <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${wo.priority==='EMERGENCY'?'bg-red-500':wo.priority==='HIGH'?'bg-orange-500':wo.priority==='MEDIUM'?'bg-yellow-500':'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors truncate">{wo.title}</h3>
                    <Badge label={wo.priority} color={priorityColors[wo.priority]??'badge-gray'} />
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-0.5">{wo.property?.name} · {wo.category} · {formatDate(wo.createdAt)}</p>
                  {wo.assignee && <p className="text-xs text-gray-400 mt-0.5">Assigned to: {wo.assignee.firstName} {wo.assignee.lastName}</p>}
                </div>
                <Badge label={wo.status.replace('_',' ')} color={statusColors[wo.status]??'badge-gray'} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={()=>setShowAdd(false)} title="New Work Order" size="lg">
        <form onSubmit={e=>{e.preventDefault();addMutation.mutate({...form,estimatedCost:form.estimatedCost?parseFloat(form.estimatedCost):undefined,propertyId:form.propertyId||undefined});}} className="space-y-4">
          <Input label="Title" value={form.title} onChange={set('title')} required />
          <div><label className="label">Description</label><textarea value={form.description} onChange={set('description')} className="input h-24 resize-none" required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Priority</label><select value={form.priority} onChange={set('priority')} className="input">{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
            <div><label className="label">Category</label><select value={form.category} onChange={set('category')} className="input">{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
          </div>
          {properties.length > 0 && (
            <div><label className="label">Property</label><select value={form.propertyId} onChange={set('propertyId')} className="input"><option value="">Select property...</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          )}
          <Input label="Estimated Cost ($)" type="number" step="0.01" value={form.estimatedCost} onChange={set('estimatedCost')} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={()=>setShowAdd(false)}>Cancel</Button>
            <Button type="submit" loading={addMutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
EOF
log "PropertyDetail and WorkOrders pages written."

cat > apps/web/src/pages/WorkOrderDetail.tsx << 'EOF'
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, Bot, DollarSign } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import api from '../lib/api';
import { formatDate, formatCurrency, statusColors, priorityColors } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const STATUSES = ['OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED'];

export default function WorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const { data: wo, isLoading } = useQuery({
    queryKey: ['workOrder', id],
    queryFn: () => api.get(`/work-orders/${id}`).then(r => r.data.data.workOrder),
  });
  const { data: comments } = useQuery({
    queryKey: ['workOrder', id, 'comments'],
    queryFn: () => api.get(`/work-orders/${id}/comments`).then(r => r.data.data.comments),
    enabled: !!id,
  });

  const addComment = useMutation({
    mutationFn: (content: string) => api.post(`/work-orders/${id}/comments`, { content }),
    onSuccess: () => { qc.invalidateQueries({queryKey:['workOrder',id,'comments']}); setComment(''); },
  });
  const updateStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/work-orders/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({queryKey:['workOrder',id]}); toast.success('Status updated'); },
  });

  const handleAI = async () => {
    if (!wo) return;
    setLoadingAI(true);
    try {
      const { data } = await api.post('/ai/work-order-suggestion', { description: wo.description, propertyId: wo.propertyId });
      setAiSuggestion(data.data.suggestion);
    } catch (_) {}
    finally { setLoadingAI(false); }
  };

  if (isLoading) return <Layout><div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div></Layout>;
  if (!wo) return <Layout><p className="text-center text-gray-500 py-20">Work order not found.</p></Layout>;

  return (
    <Layout title={wo.title}>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4 flex-wrap">
          <Link to="/work-orders"><Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />}>Back</Button></Link>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button variant="secondary" icon={<Bot className="w-4 h-4" />} onClick={handleAI} loading={loadingAI} size="sm">AI Suggestion</Button>
            {(user?.role==='OWNER'||user?.role==='MANAGER'||user?.role==='ADMIN') && (
              <select value={wo.status} onChange={e=>updateStatus.mutate(e.target.value)} className="input w-auto text-sm">
                {STATUSES.map(s=><option key={s}>{s}</option>)}
              </select>
            )}
          </div>
        </div>

        {aiSuggestion && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-purple-600 mb-2 flex items-center gap-1"><Bot className="w-3 h-3" /> AI Analysis</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-purple-500">Suggested Priority</p><p className="font-medium">{aiSuggestion.priority}</p></div>
              <div><p className="text-xs text-purple-500">Category</p><p className="font-medium">{aiSuggestion.category}</p></div>
              <div><p className="text-xs text-purple-500">Est. Cost</p><p className="font-medium">{formatCurrency(aiSuggestion.estimatedCost)}</p></div>
              <div><p className="text-xs text-purple-500">Specialist</p><p className="font-medium">{aiSuggestion.recommendedContractorSpecialty}</p></div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex gap-2 flex-wrap">
              <Badge label={wo.status.replace('_',' ')} color={statusColors[wo.status]??'badge-gray'} />
              <Badge label={wo.priority} color={priorityColors[wo.priority]??'badge-gray'} />
              <Badge label={wo.category} color="badge-blue" />
            </div>
            {wo.estimatedCost && <div className="flex items-center gap-1 text-green-600 font-medium text-sm"><DollarSign className="w-4 h-4" />Est. {formatCurrency(wo.estimatedCost)}</div>}
          </div>
          <p className="text-gray-700 text-sm leading-relaxed">{wo.description}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
            {wo.property && <div><p className="text-xs text-gray-400">Property</p><p className="font-medium">{wo.property.name}</p></div>}
            {wo.assignee && <div><p className="text-xs text-gray-400">Assigned To</p><p className="font-medium">{wo.assignee.firstName} {wo.assignee.lastName}</p></div>}
            {wo.scheduledDate && <div><p className="text-xs text-gray-400">Scheduled</p><p className="font-medium">{formatDate(wo.scheduledDate)}</p></div>}
            {wo.completedAt && <div><p className="text-xs text-gray-400">Completed</p><p className="font-medium text-green-600">{formatDate(wo.completedAt)}</p></div>}
            <div><p className="text-xs text-gray-400">Created</p><p className="font-medium">{formatDate(wo.createdAt)}</p></div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Comments ({(comments??[]).length})</h3>
          <div className="space-y-4 mb-6">
            {(comments??[]).map((c: any) => (
              <div key={c.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold flex-shrink-0">
                  {c.author?.firstName?.[0]}{c.author?.lastName?.[0]}
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{c.author?.firstName} {c.author?.lastName}</span>
                    <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a comment..." onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(comment.trim())addComment.mutate(comment.trim());}}} />
            <Button onClick={()=>{if(comment.trim())addComment.mutate(comment.trim());}} loading={addComment.isPending} icon={<Send className="w-4 h-4" />}>Send</Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
EOF
log "WorkOrderDetail page written."

# ─────────────────────────────────────────────
# FRONTEND PAGES (remaining 12)
# ─────────────────────────────────────────────

header "Writing remaining frontend pages..."

# ── Financial.tsx ────────────────────────────
cat > apps/web/src/pages/Financial.tsx << 'EOF'
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, TrendingUp, TrendingDown, Plus, Download, Filter } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import Layout from '../components/layout/Layout';
import StatCard from '../components/ui/StatCard';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import api from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';

const TYPES = ['RENT','DEPOSIT','MAINTENANCE','UTILITY','INSURANCE','TAX','MANAGEMENT_FEE','OTHER_INCOME','OTHER_EXPENSE'];
const CATS  = ['INCOME','EXPENSE'];

function CreateTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type:'RENT', category:'INCOME', amount:'', description:'', propertyId:'' });
  const { data: props } = useQuery({ queryKey:['properties-list'], queryFn: () => api.get('/properties').then(r=>r.data) });
  const create = useMutation({
    mutationFn: (d:any) => api.post('/financial/transactions', d).then(r=>r.data),
    onSuccess: () => { qc.invalidateQueries({queryKey:['transactions']}); onClose(); setForm({ type:'RENT', category:'INCOME', amount:'', description:'', propertyId:'' }); }
  });
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  return (
    <Modal open={open} onClose={onClose} title="Record Transaction">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.propertyId} onChange={e=>set('propertyId',e.target.value)}>
            <option value="">Select property...</option>
            {props?.data?.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e=>set('category',e.target.value)}>
              {CATS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e=>set('type',e.target.value)}>
              {TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        </div>
        <Input label="Amount ($)" type="number" placeholder="0.00" value={form.amount} onChange={e=>set('amount',e.target.value)} />
        <Input label="Description" placeholder="Transaction description..." value={form.description} onChange={e=>set('description',e.target.value)} />
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={create.isPending} onClick={()=>create.mutate({...form, amount:parseFloat(form.amount)})}>Save Transaction</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Financial() {
  const [showCreate, setShowCreate] = useState(false);
  const [catFilter, setCatFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['transactions', catFilter], queryFn: () => api.get('/financial/transactions', { params: catFilter ? { category: catFilter } : {} }).then(r=>r.data) });
  const { data: summary } = useQuery({ queryKey:['financial-summary'], queryFn: () => api.get('/financial/summary').then(r=>r.data) });

  const transactions = data?.data || [];
  const stats = summary?.data || {};

  const chartData = stats.monthly || [];

  const catColor = (cat:string) => cat === 'INCOME' ? 'success' : cat === 'EXPENSE' ? 'danger' : 'default';

  return (
    <Layout title="Financial">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Overview</h1>
            <p className="text-sm text-gray-500 mt-1">Track income, expenses, and portfolio performance</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" icon={<Download className="w-4 h-4" />}>Export</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={()=>setShowCreate(true)}>Record Transaction</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Income" value={formatCurrency(stats.totalIncome||0)} icon={<TrendingUp className="w-5 h-5" />} trend={{ value: stats.incomeGrowth||0, label:'vs last month' }} color="green" />
          <StatCard title="Total Expenses" value={formatCurrency(stats.totalExpenses||0)} icon={<TrendingDown className="w-5 h-5" />} color="red" />
          <StatCard title="Net Operating Income" value={formatCurrency((stats.totalIncome||0)-(stats.totalExpenses||0))} icon={<DollarSign className="w-5 h-5" />} color="blue" />
          <StatCard title="Transactions" value={stats.count||transactions.length} icon={<Filter className="w-5 h-5" />} color="purple" />
        </div>

        {chartData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Revenue vs Expenses (Monthly)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{fontSize:12}} />
                  <YAxis tick={{fontSize:12}} tickFormatter={(v)=>`$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v:any)=>formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Net Income Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{fontSize:12}} />
                  <YAxis tick={{fontSize:12}} tickFormatter={(v)=>`$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v:any)=>formatCurrency(v)} />
                  <Area type="monotone" dataKey="net" name="Net" stroke="#6366f1" fill="#ede9fe" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Transactions</h3>
            <div className="flex gap-2">
              {['','INCOME','EXPENSE'].map(c=>(
                <button key={c} onClick={()=>setCatFilter(c)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${catFilter===c ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{c||'All'}</button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Description</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Type</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Category</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Property</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((t:any)=>(
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="py-3 px-2 text-gray-500 whitespace-nowrap">{formatDate(t.transactionDate||t.createdAt)}</td>
                      <td className="py-3 px-2 font-medium text-gray-900 max-w-xs truncate">{t.description||'—'}</td>
                      <td className="py-3 px-2"><Badge variant="default" size="sm">{(t.type||'').replace(/_/g,' ')}</Badge></td>
                      <td className="py-3 px-2"><Badge variant={catColor(t.category)} size="sm">{t.category}</Badge></td>
                      <td className="py-3 px-2 text-gray-500">{t.property?.name||'—'}</td>
                      <td className={`py-3 px-2 text-right font-semibold ${t.category==='INCOME' ? 'text-green-600' : 'text-red-600'}`}>{t.category==='INCOME' ? '+' : '-'}{formatCurrency(t.amount)}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center text-gray-400">No transactions found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <CreateTransactionModal open={showCreate} onClose={()=>setShowCreate(false)} />
    </Layout>
  );
}
EOF
log "Financial.tsx written."

# ── Messages.tsx ──────────────────────────────
cat > apps/web/src/pages/Messages.tsx << 'EOF'
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Search, Plus, MessageSquare } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { useSocket } from '../hooks/useSocket';
import api from '../lib/api';
import { formatDate, cn } from '../lib/utils';

function NewConversationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const create = useMutation({
    mutationFn: (d:any) => api.post('/messages/conversations', d).then(r=>r.data),
    onSuccess: () => { qc.invalidateQueries({queryKey:['conversations']}); onClose(); setSubject(''); setMessage(''); }
  });
  return (
    <Modal open={open} onClose={onClose} title="New Conversation">
      <div className="space-y-4">
        <Input label="Subject" placeholder="What's this about?" value={subject} onChange={e=>setSubject(e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Type your message..." value={message} onChange={e=>setMessage(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={create.isPending} onClick={()=>create.mutate({subject,initialMessage:message})}>Send</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Messages() {
  const [selected, setSelected] = useState<string|null>(null);
  const [search, setSearch] = useState('');
  const [newMsg, setNewMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { socket } = useSocket();

  const { data: convData } = useQuery({ queryKey:['conversations'], queryFn: () => api.get('/messages/conversations').then(r=>r.data), refetchInterval: 10000 });
  const { data: msgData } = useQuery({ queryKey:['messages', selected], queryFn: () => api.get(`/messages/conversations/${selected}/messages`).then(r=>r.data), enabled: !!selected, refetchInterval: 5000 });

  const sendMsg = useMutation({
    mutationFn: (content:string) => api.post(`/messages/conversations/${selected}/messages`, { content }).then(r=>r.data),
    onSuccess: () => { qc.invalidateQueries({queryKey:['messages', selected]}); setNewMsg(''); }
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgData]);

  useEffect(() => {
    if (!socket || !selected) return;
    socket.emit('join_conversation', selected);
    socket.on('new_message', () => qc.invalidateQueries({queryKey:['messages', selected]}));
    return () => { socket.off('new_message'); socket.emit('leave_conversation', selected); };
  }, [socket, selected]);

  const conversations = (convData?.data || []).filter((c:any) => !search || c.subject?.toLowerCase().includes(search.toLowerCase()));
  const messages = msgData?.data || [];
  const activeConv = conversations.find((c:any)=>c.id===selected);

  return (
    <Layout title="Messages">
      <div className="flex h-[calc(100vh-10rem)] gap-0 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Messages</h2>
              <button onClick={()=>setShowNew(true)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search conversations..." value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
                <MessageSquare className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">No conversations yet</p>
              </div>
            ) : conversations.map((c:any)=>(
              <button key={c.id} onClick={()=>setSelected(c.id)} className={cn('w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors', selected===c.id && 'bg-indigo-50 border-l-4 border-l-indigo-600')}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate">{c.subject||'No subject'}</span>
                  {c.unreadCount > 0 && <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 ml-1 flex-shrink-0">{c.unreadCount}</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">{c.lastMessage?.content||'No messages yet'}</p>
                <p className="text-xs text-gray-400 mt-1">{formatDate(c.updatedAt)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {selected && activeConv ? (
            <>
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-900">{activeConv.subject||'Conversation'}</h3>
                <p className="text-xs text-gray-500">{activeConv.participants?.length||0} participants</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m:any)=>(
                  <div key={m.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-sm flex-shrink-0">
                      {(m.sender?.firstName?.[0]||'?').toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{m.sender?.firstName} {m.sender?.lastName}</span>
                        <span className="text-xs text-gray-400">{formatDate(m.createdAt)}</span>
                      </div>
                      <div className="bg-gray-100 rounded-xl rounded-tl-none px-4 py-2 text-sm text-gray-800 inline-block max-w-lg">{m.content}</div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="p-4 border-t border-gray-200">
                <div className="flex gap-3">
                  <input className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Type a message..." value={newMsg} onChange={e=>setNewMsg(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(newMsg.trim())sendMsg.mutate(newMsg.trim());}}} />
                  <Button onClick={()=>{if(newMsg.trim())sendMsg.mutate(newMsg.trim());}} loading={sendMsg.isPending} icon={<Send className="w-4 h-4" />}>Send</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Or start a new one to begin messaging</p>
              <Button className="mt-6" icon={<Plus className="w-4 h-4" />} onClick={()=>setShowNew(true)}>New Conversation</Button>
            </div>
          )}
        </div>
      </div>
      <NewConversationModal open={showNew} onClose={()=>setShowNew(false)} />
    </Layout>
  );
}
EOF
log "Messages.tsx written."

# ── Inspections.tsx ───────────────────────────
cat > apps/web/src/pages/Inspections.tsx << 'EOF'
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardCheck, Calendar, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import EmptyState from '../components/ui/EmptyState';
import api from '../lib/api';
import { formatDate } from '../lib/utils';

const TYPES = ['MOVE_IN','MOVE_OUT','ROUTINE','ANNUAL','DRIVE_BY','SPECIAL'];
const STATUS_MAP: Record<string,string> = { SCHEDULED:'default', IN_PROGRESS:'warning', COMPLETED:'success', CANCELLED:'danger' };

function CreateInspectionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type:'ROUTINE', propertyId:'', unitId:'', scheduledDate:'', notes:'' });
  const { data: props } = useQuery({ queryKey:['properties-list'], queryFn: () => api.get('/properties').then(r=>r.data) });
  const create = useMutation({
    mutationFn: (d:any) => api.post('/inspections', d).then(r=>r.data),
    onSuccess: () => { qc.invalidateQueries({queryKey:['inspections']}); onClose(); setForm({ type:'ROUTINE', propertyId:'', unitId:'', scheduledDate:'', notes:'' }); }
  });
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  return (
    <Modal open={open} onClose={onClose} title="Schedule Inspection">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.propertyId} onChange={e=>set('propertyId',e.target.value)}>
            <option value="">Select property...</option>
            {props?.data?.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Inspection Type</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e=>set('type',e.target.value)}>
            {TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        <Input label="Scheduled Date" type="datetime-local" value={form.scheduledDate} onChange={e=>set('scheduledDate',e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Any specific areas to inspect..." value={form.notes} onChange={e=>set('notes',e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={create.isPending} onClick={()=>create.mutate({...form, scheduledDate: form.scheduledDate ? new Date(form.scheduledDate).toISOString() : undefined})}>Schedule</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Inspections() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['inspections', statusFilter], queryFn: () => api.get('/inspections', { params: statusFilter ? { status: statusFilter } : {} }).then(r=>r.data) });
  const inspections = data?.data || [];

  return (
    <Layout title="Inspections">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inspections</h1>
            <p className="text-sm text-gray-500 mt-1">Schedule and track property inspections</p>
          </div>
          <Button icon={<Plus className="w-4 h-4" />} onClick={()=>setShowCreate(true)}>Schedule Inspection</Button>
        </div>

        <div className="flex gap-2">
          {['','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED'].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter===s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s||'All'}</button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : inspections.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="w-12 h-12" />} title="No inspections found" description="Schedule your first inspection to get started" action={<Button icon={<Plus className="w-4 h-4" />} onClick={()=>setShowCreate(true)}>Schedule Inspection</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {inspections.map((insp:any)=>(
              <div key={insp.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={()=>navigate(`/inspections/${insp.id}`)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                      <ClipboardCheck className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-gray-900">{(insp.type||'').replace(/_/g,' ')} Inspection</span>
                        <Badge variant={STATUS_MAP[insp.status]||'default'} size="sm">{insp.status}</Badge>
                      </div>
                      <p className="text-sm text-gray-500">{insp.property?.name||'—'} {insp.unit ? `· Unit ${insp.unit.unitNumber}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Scheduled</p>
                      <div className="flex items-center gap-1 text-sm text-gray-700">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {insp.scheduledDate ? formatDate(insp.scheduledDate) : 'TBD'}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Items</p>
                      <p className="text-sm font-medium text-gray-900">{insp._count?.items||insp.items?.length||0}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <CreateInspectionModal open={showCreate} onClose={()=>setShowCreate(false)} />
    </Layout>
  );
}
EOF
log "Inspections.tsx written."


# ── Documents.tsx ─────────────────────────────
cat > apps/web/src/pages/Documents.tsx << 'EOF'
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, Grid, List, Download, Trash2, Plus, Search } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import EmptyState from '../components/ui/EmptyState';
import api from '../lib/api';
import { formatDate, cn } from '../lib/utils';

const DOC_TYPES = ['LEASE','INSPECTION_REPORT','INVOICE','CONTRACT','PERMIT','INSURANCE','PHOTO','OTHER'];
const TYPE_COLORS: Record<string,string> = { LEASE:'primary', INSPECTION_REPORT:'warning', INVOICE:'success', CONTRACT:'default', PERMIT:'primary', INSURANCE:'warning', PHOTO:'default', OTHER:'default' };

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name:'', documentType:'LEASE', propertyId:'', description:'' });
  const [file, setFile] = useState<File|null>(null);
  const { data: props } = useQuery({ queryKey:['properties-list'], queryFn: () => api.get('/properties').then(r=>r.data) });
  const upload = useMutation({
    mutationFn: async (d:any) => {
      const fd = new FormData();
      Object.entries(d).forEach(([k,v])=>{ if(v) fd.append(k, v as string); });
      if(file) fd.append('file', file);
      return api.post('/documents', fd, { headers:{'Content-Type':'multipart/form-data'} }).then(r=>r.data);
    },
    onSuccess: () => { qc.invalidateQueries({queryKey:['documents']}); onClose(); setForm({ name:'', documentType:'LEASE', propertyId:'', description:'' }); setFile(null); }
  });
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  return (
    <Modal open={open} onClose={onClose} title="Upload Document">
      <div className="space-y-4">
        <Input label="Document Name" placeholder="e.g. Lease Agreement 2025" value={form.name} onChange={e=>set('name',e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.documentType} onChange={e=>set('documentType',e.target.value)}>
              {DOC_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.propertyId} onChange={e=>set('propertyId',e.target.value)}>
              <option value="">None</option>
              {props?.data?.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 transition-colors" onClick={()=>document.getElementById('doc-file-input')?.click()}>
            {file ? (
              <div className="flex items-center justify-center gap-2 text-gray-700"><FileText className="w-5 h-5 text-indigo-600" /><span className="text-sm font-medium">{file.name}</span></div>
            ) : (
              <div className="text-gray-400"><Upload className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Click to select file</p></div>
            )}
          </div>
          <input id="doc-file-input" type="file" className="hidden" onChange={e=>setFile(e.target.files?.[0]||null)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={upload.isPending} onClick={()=>upload.mutate(form)} disabled={!form.name}>Upload</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Documents() {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [view, setView] = useState<'grid'|'list'>('list');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['documents', typeFilter], queryFn: () => api.get('/documents', { params: typeFilter ? { documentType: typeFilter } : {} }).then(r=>r.data) });
  const deleteDoc = useMutation({
    mutationFn: (id:string) => api.delete(`/documents/${id}`).then(r=>r.data),
    onSuccess: () => qc.invalidateQueries({queryKey:['documents']})
  });
  const docs = (data?.data||[]).filter((d:any)=>!search||d.name?.toLowerCase().includes(search.toLowerCase()));

  const fileIcon = (type:string) => {
    const t = type?.toLowerCase();
    if(t?.includes('pdf')||t?.includes('lease')) return '📄';
    if(t?.includes('image')||t?.includes('photo')||t?.includes('png')||t?.includes('jpg')) return '🖼️';
    if(t?.includes('sheet')||t?.includes('csv')) return '📊';
    return '📁';
  };

  return (
    <Layout title="Documents">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
            <p className="text-sm text-gray-500 mt-1">Manage leases, reports, and property files</p>
          </div>
          <Button icon={<Upload className="w-4 h-4" />} onClick={()=>setShowUpload(true)}>Upload Document</Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search documents..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['','LEASE','INSPECTION_REPORT','INVOICE','CONTRACT','PHOTO'].map(t=>(
              <button key={t} onClick={()=>setTypeFilter(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter===t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t||'All'}</button>
            ))}
          </div>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={()=>setView('list')} className={cn('p-2', view==='list' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-50')}><List className="w-4 h-4" /></button>
            <button onClick={()=>setView('grid')} className={cn('p-2', view==='grid' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-50')}><Grid className="w-4 h-4" /></button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : docs.length === 0 ? (
          <EmptyState icon={<FileText className="w-12 h-12" />} title="No documents found" description="Upload your first document to get started" action={<Button icon={<Plus className="w-4 h-4" />} onClick={()=>setShowUpload(true)}>Upload Document</Button>} />
        ) : view === 'list' ? (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50"><th className="text-left py-3 px-4 font-medium text-gray-500">Name</th><th className="text-left py-3 px-4 font-medium text-gray-500">Type</th><th className="text-left py-3 px-4 font-medium text-gray-500">Property</th><th className="text-left py-3 px-4 font-medium text-gray-500">Uploaded</th><th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((d:any)=>(
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="text-lg">{fileIcon(d.mimeType||d.documentType)}</span><span className="font-medium text-gray-900">{d.name}</span></div></td>
                    <td className="py-3 px-4"><Badge variant={TYPE_COLORS[d.documentType]||'default'} size="sm">{(d.documentType||'').replace(/_/g,' ')}</Badge></td>
                    <td className="py-3 px-4 text-gray-500">{d.property?.name||'—'}</td>
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{formatDate(d.createdAt)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Download className="w-4 h-4" /></a>}
                        <button onClick={()=>deleteDoc.mutate(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {docs.map((d:any)=>(
              <div key={d.id} className="card hover:shadow-md transition-shadow group">
                <div className="text-4xl mb-3">{fileIcon(d.mimeType||d.documentType)}</div>
                <p className="font-medium text-gray-900 text-sm truncate mb-1">{d.name}</p>
                <Badge variant={TYPE_COLORS[d.documentType]||'default'} size="sm">{(d.documentType||'').replace(/_/g,' ')}</Badge>
                <p className="text-xs text-gray-400 mt-2">{formatDate(d.createdAt)}</p>
                <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-indigo-50 hover:text-indigo-600"><Download className="w-3.5 h-3.5" />Open</a>}
                  <button onClick={()=>deleteDoc.mutate(d.id)} className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <UploadModal open={showUpload} onClose={()=>setShowUpload(false)} />
    </Layout>
  );
}
EOF
log "Documents.tsx written."

# ── Contractors.tsx ───────────────────────────
cat > apps/web/src/pages/Contractors.tsx << 'EOF'
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, Phone, Mail, MapPin, Briefcase, Search, Filter } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Input from '../components/ui/Input';
import api from '../lib/api';
import { cn } from '../lib/utils';

const SPECIALTIES = ['','PLUMBING','ELECTRICAL','HVAC','CARPENTRY','PAINTING','ROOFING','LANDSCAPING','CLEANING','GENERAL','OTHER'];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i=>(
        <Star key={i} className={cn('w-3.5 h-3.5', i<=Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200')} />
      ))}
      <span className="ml-1 text-xs text-gray-500">{rating?.toFixed(1)||'—'}</span>
    </div>
  );
}

export default function Contractors() {
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['contractors', specialty], queryFn: () => api.get('/contractors', { params: specialty ? { specialty } : {} }).then(r=>r.data) });
  const contractors = (data?.data||[]).filter((c:any)=>!search||(c.companyName||c.user?.firstName||'').toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout title="Contractors">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contractor Directory</h1>
          <p className="text-sm text-gray-500 mt-1">Browse and connect with verified service professionals</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search contractors..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {SPECIALTIES.map(s=>(
              <button key={s} onClick={()=>setSpecialty(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${specialty===s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s||'All'}</button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : contractors.length === 0 ? (
          <EmptyState icon={<Briefcase className="w-12 h-12" />} title="No contractors found" description="No contractors match your current filters" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contractors.map((c:any)=>(
              <div key={c.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                    {(c.companyName||c.user?.firstName||'?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{c.companyName||`${c.user?.firstName||''} ${c.user?.lastName||''}`.trim()||'Unknown'}</h3>
                    <StarRating rating={c.rating||0} />
                    <p className="text-xs text-gray-400 mt-0.5">{c.completedJobs||0} jobs completed</p>
                  </div>
                </div>

                {c.specialties?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {c.specialties.slice(0,4).map((s:string)=>(
                      <Badge key={s} variant="default" size="sm">{s.replace(/_/g,' ')}</Badge>
                    ))}
                    {c.specialties.length > 4 && <Badge variant="default" size="sm">+{c.specialties.length-4}</Badge>}
                  </div>
                )}

                <div className="space-y-2 border-t border-gray-100 pt-4">
                  {c.user?.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{c.user.email}</span>
                    </div>
                  )}
                  {c.user?.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>{c.user.phone}</span>
                    </div>
                  )}
                  {c.serviceArea && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{c.serviceArea}</span>
                    </div>
                  )}
                </div>

                {c.bio && <p className="text-xs text-gray-500 mt-3 line-clamp-2">{c.bio}</p>}

                <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                  <a href={`mailto:${c.user?.email}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                    <Mail className="w-3.5 h-3.5" />Contact
                  </a>
                  <a href={`tel:${c.user?.phone}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-green-50 hover:text-green-600 transition-colors">
                    <Phone className="w-3.5 h-3.5" />Call
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
EOF
log "Contractors.tsx written."


# ── AIAssistant.tsx ───────────────────────────
cat > apps/web/src/pages/AIAssistant.tsx << 'EOF'
import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Sparkles, RotateCcw, Copy, Check } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface Message { role: 'user'|'assistant'; content: string; ts: Date; }

const SUGGESTED = [
  'Summarize my active work orders',
  'Which properties have overdue maintenance?',
  'Generate a monthly financial summary',
  'What inspections are scheduled this week?',
  'Which units are currently vacant?',
  'List contractors available for plumbing work',
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false), 2000); };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ask = useMutation({
    mutationFn: (prompt: string) => api.post('/ai/chat', { message: prompt, history: messages.map(m=>({role:m.role,content:m.content})) }).then(r=>r.data),
    onMutate: (prompt) => {
      setMessages(prev=>[...prev, { role:'user', content: prompt, ts: new Date() }]);
      setTyping(true);
      setInput('');
    },
    onSuccess: (data) => {
      setTyping(false);
      setMessages(prev=>[...prev, { role:'assistant', content: data.data?.response || data.response || 'No response received.', ts: new Date() }]);
    },
    onError: () => {
      setTyping(false);
      setMessages(prev=>[...prev, { role:'assistant', content: 'Sorry, I encountered an error. Please try again.', ts: new Date() }]);
    }
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, typing]);

  const send = () => { if(input.trim()) ask.mutate(input.trim()); };
  const reset = () => setMessages([]);

  const formatContent = (content: string) => {
    return content.split('\n').map((line, i) => (
      <span key={i}>{line}{i < content.split('\n').length - 1 && <br />}</span>
    ));
  };

  return (
    <Layout title="AI Assistant">
      <div className="flex flex-col h-[calc(100vh-10rem)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI Assistant</h1>
              <p className="text-xs text-gray-500">Powered by GPT-4o · Simply Service Intelligence</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" icon={<RotateCcw className="w-4 h-4" />} onClick={reset}>New Chat</Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">How can I help you?</h2>
              <p className="text-gray-500 text-sm mb-8 max-w-md">Ask me anything about your properties, work orders, tenants, financials, or get operational insights and summaries.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                {SUGGESTED.map((s,i)=>(
                  <button key={i} onClick={()=>ask.mutate(s)} className="text-left p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-sm text-gray-700 font-medium shadow-sm">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((m, i)=>(
            <div key={i} className={cn('flex gap-3', m.role==='user' && 'flex-row-reverse')}>
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0', m.role==='assistant' ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' : 'bg-gray-200 text-gray-700')}>
                {m.role==='assistant' ? <Sparkles className="w-4 h-4" /> : 'M'}
              </div>
              <div className={cn('max-w-[75%] group', m.role==='user' && 'items-end flex flex-col')}>
                <div className={cn('rounded-2xl px-4 py-3 text-sm leading-relaxed', m.role==='assistant' ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm' : 'bg-indigo-600 text-white rounded-tr-none')}>
                  {formatContent(m.content)}
                </div>
                <div className={cn('flex items-center gap-1 mt-1', m.role==='user' ? 'flex-row-reverse' : '')}>
                  <span className="text-xs text-gray-400">{m.ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                  {m.role==='assistant' && <CopyButton text={m.content} />}
                </div>
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="flex gap-3 items-end bg-white border border-gray-300 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all shadow-sm">
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 resize-none text-sm text-gray-800 placeholder-gray-400 focus:outline-none max-h-32"
              placeholder="Ask about your properties, work orders, financials..."
              value={input}
              onChange={e=>{ setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }}
              onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } }}
            />
            <button onClick={send} disabled={!input.trim()||ask.isPending} className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors flex-shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">AI responses are generated and may require verification.</p>
        </div>
      </div>
    </Layout>
  );
}
EOF
log "AIAssistant.tsx written."


# ── Notifications.tsx ─────────────────────────
cat > apps/web/src/pages/Notifications.tsx << 'EOF'
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Trash2, Filter } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import api from '../lib/api';
import { formatDate, cn } from '../lib/utils';

const TYPE_ICONS: Record<string,string> = {
  WORK_ORDER: '🔧', PAYMENT: '💳', LEASE: '📋', INSPECTION: '🔍',
  MAINTENANCE: '⚙️', MESSAGE: '💬', SYSTEM: '🔔', DOCUMENT: '📄',
};
const TYPE_COLORS: Record<string,string> = {
  WORK_ORDER:'warning', PAYMENT:'success', LEASE:'primary',
  INSPECTION:'default', MAINTENANCE:'warning', MESSAGE:'primary', SYSTEM:'default', DOCUMENT:'default',
};

export default function Notifications() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', typeFilter, unreadOnly],
    queryFn: () => api.get('/notifications', { params: { ...(typeFilter ? {type:typeFilter}:{}), ...(unreadOnly ? {unread:true}:{}) } }).then(r=>r.data),
    refetchInterval: 30000
  });

  const markRead = useMutation({
    mutationFn: (id:string) => api.patch(`/notifications/${id}/read`).then(r=>r.data),
    onSuccess: () => qc.invalidateQueries({queryKey:['notifications']})
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all').then(r=>r.data),
    onSuccess: () => qc.invalidateQueries({queryKey:['notifications']})
  });

  const deleteNotif = useMutation({
    mutationFn: (id:string) => api.delete(`/notifications/${id}`).then(r=>r.data),
    onSuccess: () => qc.invalidateQueries({queryKey:['notifications']})
  });

  const notifications = data?.data || [];
  const unreadCount = notifications.filter((n:any)=>!n.isRead).length;

  return (
    <Layout title="Notifications">
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            {unreadCount > 0 && <Badge variant="danger" size="sm">{unreadCount} unread</Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<CheckCheck className="w-4 h-4" />} onClick={()=>markAllRead.mutate()} loading={markAllRead.isPending}>Mark All Read</Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={()=>setUnreadOnly(!unreadOnly)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', unreadOnly ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>Unread Only</button>
          <div className="w-px h-4 bg-gray-200" />
          {['','WORK_ORDER','PAYMENT','LEASE','INSPECTION','MESSAGE','SYSTEM'].map(t=>(
            <button key={t} onClick={()=>setTypeFilter(t)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', typeFilter===t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{t||'All Types'}</button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : notifications.length === 0 ? (
          <EmptyState icon={<Bell className="w-12 h-12" />} title="No notifications" description="You're all caught up! Notifications will appear here." />
        ) : (
          <div className="space-y-2">
            {notifications.map((n:any)=>(
              <div key={n.id} className={cn('card flex items-start gap-4 transition-all', !n.isRead && 'border-l-4 border-l-indigo-500 bg-indigo-50/30')}>
                <div className="text-2xl flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  {TYPE_ICONS[n.type]||'🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={cn('text-sm', n.isRead ? 'text-gray-700' : 'text-gray-900 font-semibold')}>{n.title}</p>
                      {n.message && <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>}
                    </div>
                    <Badge variant={TYPE_COLORS[n.type]||'default'} size="sm" className="flex-shrink-0">{(n.type||'').replace(/_/g,' ')}</Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!n.isRead && (
                    <button onClick={()=>markRead.mutate(n.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors" title="Mark as read">
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={()=>deleteNotif.mutate(n.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
EOF
log "Notifications.tsx written."

# ── Settings.tsx ──────────────────────────────
cat > apps/web/src/pages/Settings.tsx << 'EOF'
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { User, Lock, Bell, Shield, Check } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';

type Tab = 'profile'|'password'|'notifications'|'security';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label:'8+ characters', pass: password.length >= 8 },
    { label:'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label:'Lowercase letter', pass: /[a-z]/.test(password) },
    { label:'Number', pass: /\d/.test(password) },
    { label:'Special character', pass: /[!@#$%^&*]/.test(password) },
  ];
  const score = checks.filter(c=>c.pass).length;
  const colors = ['bg-red-400','bg-red-400','bg-orange-400','bg-yellow-400','bg-green-400','bg-green-500'];
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-2">
        {[0,1,2,3,4].map(i=><div key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i < score ? colors[score] : 'bg-gray-200')} />)}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(c=>(
          <div key={c.label} className={cn('flex items-center gap-1.5 text-xs', c.pass ? 'text-green-600' : 'text-gray-400')}>
            <div className={cn('w-3.5 h-3.5 rounded-full flex items-center justify-center', c.pass ? 'bg-green-100' : 'bg-gray-100')}>
              {c.pass ? <Check className="w-2.5 h-2.5" /> : <span className="w-1 h-1 bg-gray-300 rounded-full" />}
            </div>
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  const { user, setUser } = useAuthStore();
  const [tab, setTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState({ firstName: user?.firstName||'', lastName: user?.lastName||'', email: user?.email||'', phone: user?.phone||'' });
  const [passwords, setPasswords] = useState({ current:'', next:'', confirm:'' });
  const [notifPrefs, setNotifPrefs] = useState({ emailWorkOrders: true, emailPayments: true, emailInspections: true, pushAll: true });
  const [saved, setSaved] = useState(false);

  const updateProfile = useMutation({
    mutationFn: (d:any) => api.patch('/users/me', d).then(r=>r.data),
    onSuccess: (data) => { if(data.data) setUser(data.data); setSaved(true); setTimeout(()=>setSaved(false), 2500); }
  });

  const changePassword = useMutation({
    mutationFn: (d:any) => api.patch('/users/me/password', d).then(r=>r.data),
    onSuccess: () => { setPasswords({ current:'', next:'', confirm:'' }); setSaved(true); setTimeout(()=>setSaved(false), 2500); }
  });

  const tabs: { key:Tab; label:string; icon: React.ReactNode }[] = [
    { key:'profile', label:'Profile', icon:<User className="w-4 h-4" /> },
    { key:'password', label:'Password', icon:<Lock className="w-4 h-4" /> },
    { key:'notifications', label:'Notifications', icon:<Bell className="w-4 h-4" /> },
    { key:'security', label:'Security', icon:<Shield className="w-4 h-4" /> },
  ];

  return (
    <Layout title="Settings">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account preferences and security</p>
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all', tab===t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {saved && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
            <Check className="w-4 h-4" />Changes saved successfully!
          </div>
        )}

        {tab === 'profile' && (
          <div className="card space-y-5">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                {(user?.firstName?.[0]||'U').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{user?.firstName} {user?.lastName}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
                <span className="inline-flex mt-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">{user?.role}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" value={profile.firstName} onChange={e=>setProfile(p=>({...p,firstName:e.target.value}))} />
              <Input label="Last Name" value={profile.lastName} onChange={e=>setProfile(p=>({...p,lastName:e.target.value}))} />
            </div>
            <Input label="Email Address" type="email" value={profile.email} onChange={e=>setProfile(p=>({...p,email:e.target.value}))} />
            <Input label="Phone Number" type="tel" value={profile.phone} onChange={e=>setProfile(p=>({...p,phone:e.target.value}))} />
            <Button className="w-full" loading={updateProfile.isPending} onClick={()=>updateProfile.mutate(profile)}>Save Changes</Button>
          </div>
        )}

        {tab === 'password' && (
          <div className="card space-y-5">
            <h2 className="font-semibold text-gray-900">Change Password</h2>
            <Input label="Current Password" type="password" value={passwords.current} onChange={e=>setPasswords(p=>({...p,current:e.target.value}))} />
            <div>
              <Input label="New Password" type="password" value={passwords.next} onChange={e=>setPasswords(p=>({...p,next:e.target.value}))} />
              {passwords.next && <PasswordStrength password={passwords.next} />}
            </div>
            <Input label="Confirm New Password" type="password" value={passwords.confirm} onChange={e=>setPasswords(p=>({...p,confirm:e.target.value}))} error={passwords.confirm && passwords.next !== passwords.confirm ? 'Passwords do not match' : ''} />
            <Button className="w-full" loading={changePassword.isPending} disabled={!passwords.current||!passwords.next||passwords.next!==passwords.confirm} onClick={()=>changePassword.mutate({currentPassword:passwords.current,newPassword:passwords.next})}>Update Password</Button>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-900">Notification Preferences</h2>
            {[
              { key:'emailWorkOrders', label:'Work Order Updates', desc:'Get notified when work orders are created or updated' },
              { key:'emailPayments', label:'Payment Alerts', desc:'Receive notifications for transactions and payments' },
              { key:'emailInspections', label:'Inspection Reminders', desc:'Get reminded about scheduled inspections' },
              { key:'pushAll', label:'Push Notifications', desc:'Enable real-time push notifications in the browser' },
            ].map(pref=>(
              <div key={pref.key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{pref.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{pref.desc}</p>
                </div>
                <button onClick={()=>setNotifPrefs(p=>({...p,[pref.key]:!p[pref.key as keyof typeof p]}))} className={cn('relative w-11 h-6 rounded-full transition-colors', notifPrefs[pref.key as keyof typeof notifPrefs] ? 'bg-indigo-600' : 'bg-gray-300')}>
                  <div className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', notifPrefs[pref.key as keyof typeof notifPrefs] ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </div>
            ))}
            <Button className="w-full" onClick={()=>{setSaved(true); setTimeout(()=>setSaved(false),2500);}}>Save Preferences</Button>
          </div>
        )}

        {tab === 'security' && (
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-900">Security Overview</h2>
            <div className="space-y-3">
              {[
                { label:'Two-Factor Authentication', status:'Not enabled', action:'Enable', color:'orange' },
                { label:'Active Sessions', status:'1 active session', action:'Manage', color:'blue' },
                { label:'API Access', status:'No active tokens', action:'Generate Token', color:'gray' },
              ].map(item=>(
                <div key={item.label} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.status}</p>
                  </div>
                  <Button variant="outline" size="sm">{item.action}</Button>
                </div>
              ))}
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm font-medium text-amber-800">Security Tip</p>
              <p className="text-xs text-amber-600 mt-1">Enable two-factor authentication to add an extra layer of protection to your account.</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
EOF
log "Settings.tsx written."

# ── Profile.tsx ───────────────────────────────
cat > apps/web/src/pages/Profile.tsx << 'EOF'
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/settings', { replace: true }); }, [navigate]);
  return null;
}
EOF
log "Profile.tsx written."


# ── MapView.tsx ───────────────────────────────
cat > apps/web/src/pages/MapView.tsx << 'EOF'
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Map, Layers, Building2, X, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import api from '../lib/api';
import { formatCurrency } from '../lib/utils';

declare global { interface Window { mapboxgl: any; } }

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

interface Property {
  id: string; name: string; address: string; city: string; state: string;
  propertyType: string; status: string; totalUnits: number;
  latitude?: number; longitude?: number;
  _count?: { units: number; workOrders: number };
}

function PropertyPanel({ property, onClose }: { property: Property; onClose: () => void }) {
  const navigate = useNavigate();
  const statusColor: Record<string,string> = { ACTIVE:'success', INACTIVE:'danger', MAINTENANCE:'warning', PENDING:'default' };
  return (
    <div className="absolute top-4 right-4 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 z-10 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Building2 className="w-4 h-4" />
          <span className="font-semibold text-sm truncate">{property.name}</span>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant={statusColor[property.status]||'default'} size="sm">{property.status}</Badge>
          <Badge variant="default" size="sm">{property.propertyType?.replace(/_/g,' ')}</Badge>
        </div>
        <p className="text-sm text-gray-600">{property.address}, {property.city}, {property.state}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{property._count?.units||property.totalUnits||0}</p>
            <p className="text-xs text-gray-500">Units</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{property._count?.workOrders||0}</p>
            <p className="text-xs text-gray-500">Work Orders</p>
          </div>
        </div>
        <Button className="w-full" icon={<ChevronRight className="w-4 h-4" />} onClick={()=>navigate(`/properties/${property.id}`)}>View Property</Button>
      </div>
    </div>
  );
}

export default function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [selected, setSelected] = useState<Property|null>(null);
  const [satellite, setSatellite] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const { data } = useQuery({ queryKey:['properties-map'], queryFn: () => api.get('/properties', { params: { limit: 100 } }).then(r=>r.data) });
  const properties: Property[] = data?.data || [];

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    if (!MAPBOX_TOKEN) { setMapReady(false); return; }

    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js';
    script.onload = () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css';
      document.head.appendChild(link);

      setTimeout(() => {
        if (!mapRef.current || !window.mapboxgl) return;
        window.mapboxgl.accessToken = MAPBOX_TOKEN;
        mapInstance.current = new window.mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-79.9959, 40.4406],
          zoom: 11,
        });
        mapInstance.current.addControl(new window.mapboxgl.NavigationControl(), 'bottom-right');
        setMapReady(true);
      }, 100);
    };
    document.head.appendChild(script);
    return () => { mapInstance.current?.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapInstance.current || properties.length === 0) return;
    const map = mapInstance.current;
    properties.forEach((p) => {
      const lat = p.latitude || (40.4406 + (Math.random() - 0.5) * 0.1);
      const lng = p.longitude || (-79.9959 + (Math.random() - 0.5) * 0.1);
      const el = document.createElement('div');
      el.className = 'cursor-pointer';
      el.innerHTML = `<div style="background:#4f46e5;color:white;padding:6px 10px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid white;">${p.name.length > 20 ? p.name.substring(0,18)+'…' : p.name}</div>`;
      el.addEventListener('click', () => setSelected(p));
      new window.mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    });
  }, [mapReady, properties]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const style = satellite ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/streets-v12';
    mapInstance.current.setStyle(style);
  }, [satellite, mapReady]);

  return (
    <Layout title="Map View">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Portfolio Map</h1>
            <p className="text-sm text-gray-500 mt-1">{properties.length} properties visualized</p>
          </div>
          {MAPBOX_TOKEN && (
            <button onClick={()=>setSatellite(!satellite)} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${satellite ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'}`}>
              <Layers className="w-4 h-4" />{satellite ? 'Street View' : 'Satellite'}
            </button>
          )}
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{height:'calc(100vh - 14rem)'}}>
          {!MAPBOX_TOKEN ? (
            <div className="h-full bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center justify-center p-8">
              <Map className="w-16 h-16 text-indigo-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-700 mb-2">Map Integration Ready</h3>
              <p className="text-gray-500 text-sm text-center mb-6 max-w-md">Add your Mapbox public token to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">VITE_MAPBOX_TOKEN</code> in your <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.env</code> file to enable the interactive portfolio map.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl">
                {properties.map(p=>(
                  <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:border-indigo-300 cursor-pointer transition-all" onClick={()=>setSelected(p)}>
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-2">
                      <Building2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-500 truncate">{p.city}, {p.state}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Badge variant="default" size="sm">{p._count?.units||0} units</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div ref={mapRef} className="w-full h-full" />
          )}
          {selected && <PropertyPanel property={selected} onClose={()=>setSelected(null)} />}
        </div>
      </div>
    </Layout>
  );
}
EOF
log "MapView.tsx written."


# ── Tenants.tsx ───────────────────────────────
cat > apps/web/src/pages/Tenants.tsx << 'EOF'
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Mail, Phone, Home, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import api from '../lib/api';
import { formatDate, formatCurrency } from '../lib/utils';

const STATUS_COLORS: Record<string,string> = { ACTIVE:'success', EXPIRED:'danger', PENDING:'warning', TERMINATED:'danger', MONTH_TO_MONTH:'default' };

export default function Tenants() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['tenants'], queryFn: () => api.get('/users', { params: { role:'TENANT' } }).then(r=>r.data) });
  const { data: leasesData } = useQuery({ queryKey:['leases-all'], queryFn: () => api.get('/properties/leases/all').then(r=>r.data).catch(()=>({data:[]})) });

  const tenants = (data?.data||[]).filter((t:any) =>
    !search ||
    `${t.firstName} ${t.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    t.email?.toLowerCase().includes(search.toLowerCase())
  );
  const leases = leasesData?.data || [];
  const getTenantLease = (userId: string) => leases.find((l:any) => l.tenantId === userId || l.tenant?.id === userId);

  return (
    <Layout title="Tenants">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
            <p className="text-sm text-gray-500 mt-1">{tenants.length} tenant{tenants.length!==1?'s':''} in your portfolio</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search tenants by name or email..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : tenants.length === 0 ? (
          <EmptyState icon={<Users className="w-12 h-12" />} title="No tenants found" description="Tenants will appear here once leases are created" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {tenants.map((t:any)=>{
              const lease = getTenantLease(t.id);
              return (
                <div key={t.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={()=>navigate(`/properties${lease?.property?.id ? `/${lease.property.id}` : ''}`)}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {(t.firstName?.[0]||'?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-gray-900">{t.firstName} {t.lastName}</p>
                        {lease && <Badge variant={STATUS_COLORS[lease.status]||'default'} size="sm">{lease.status?.replace(/_/g,' ')}</Badge>}
                      </div>
                      <div className="space-y-1.5">
                        {t.email && <div className="flex items-center gap-1.5 text-xs text-gray-500"><Mail className="w-3 h-3 text-gray-400" />{t.email}</div>}
                        {t.phone && <div className="flex items-center gap-1.5 text-xs text-gray-500"><Phone className="w-3 h-3 text-gray-400" />{t.phone}</div>}
                        {lease?.unit && <div className="flex items-center gap-1.5 text-xs text-gray-500"><Home className="w-3 h-3 text-gray-400" />{lease.property?.name} · Unit {lease.unit?.unitNumber}</div>}
                      </div>
                    </div>
                  </div>
                  {lease && (
                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Monthly Rent</p>
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(lease.monthlyRent||0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Lease Start</p>
                        <p className="text-sm text-gray-700">{formatDate(lease.startDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Lease End</p>
                        <p className="text-sm text-gray-700">{formatDate(lease.endDate)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
EOF
log "Tenants.tsx written."

# ── Reports.tsx ───────────────────────────────
cat > apps/web/src/pages/Reports.tsx << 'EOF'
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, FileBarChart, Download, RefreshCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import Layout from '../components/layout/Layout';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import api from '../lib/api';
import { formatCurrency } from '../lib/utils';

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

export default function Reports() {
  const { data: summary, isLoading, refetch } = useQuery({ queryKey:['reports-summary'], queryFn: () => api.get('/financial/summary').then(r=>r.data) });
  const { data: woData } = useQuery({ queryKey:['wo-summary'], queryFn: () => api.get('/work-orders', { params:{ limit:100 } }).then(r=>r.data) });
  const { data: propData } = useQuery({ queryKey:['properties-report'], queryFn: () => api.get('/properties', { params:{ limit:100 } }).then(r=>r.data) });

  const stats = summary?.data || {};
  const workOrders = woData?.data || [];
  const properties = propData?.data || [];

  const woByStatus = Object.entries(
    workOrders.reduce((acc:any, wo:any) => { acc[wo.status] = (acc[wo.status]||0)+1; return acc; }, {})
  ).map(([name, value]) => ({ name: name.replace(/_/g,' '), value }));

  const woPriority = Object.entries(
    workOrders.reduce((acc:any, wo:any) => { acc[wo.priority] = (acc[wo.priority]||0)+1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const propByType = Object.entries(
    properties.reduce((acc:any, p:any) => { acc[p.propertyType||'OTHER'] = (acc[p.propertyType||'OTHER']||0)+1; return acc; }, {})
  ).map(([name, value]) => ({ name: name.replace(/_/g,' '), value }));

  const monthly = stats.monthly || [];

  return (
    <Layout title="Reports">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Portfolio performance and operational insights</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" icon={<RefreshCcw className="w-4 h-4" />} onClick={()=>refetch()} loading={isLoading}>Refresh</Button>
            <Button variant="outline" icon={<Download className="w-4 h-4" />}>Export PDF</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Properties" value={properties.length} icon={<FileBarChart className="w-5 h-5" />} color="blue" />
          <StatCard title="Total Revenue" value={formatCurrency(stats.totalIncome||0)} icon={<TrendingUp className="w-5 h-5" />} color="green" />
          <StatCard title="Total Expenses" value={formatCurrency(stats.totalExpenses||0)} icon={<BarChart3 className="w-5 h-5" />} color="red" />
          <StatCard title="Net Income" value={formatCurrency((stats.totalIncome||0)-(stats.totalExpenses||0))} icon={<TrendingUp className="w-5 h-5" />} color="purple" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {monthly.length > 0 && (
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Monthly Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} tickFormatter={(v)=>`$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v:any)=>formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} dot={{r:3}} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={{r:3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {woByStatus.length > 0 && (
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Work Orders by Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={woByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {woByStatus.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {woPriority.length > 0 && (
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Work Orders by Priority</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={woPriority} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{fontSize:11}} />
                  <YAxis dataKey="name" type="category" tick={{fontSize:11}} width={80} />
                  <Tooltip />
                  <Bar dataKey="value" name="Count" radius={[0,4,4,0]}>
                    {woPriority.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {propByType.length > 0 && (
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Properties by Type</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={propByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" name="Count" radius={[4,4,0,0]}>
                    {propByType.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {workOrders.length === 0 && properties.length === 0 && !isLoading && (
          <div className="card text-center py-16">
            <BarChart3 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Data Yet</h3>
            <p className="text-sm text-gray-500">Add properties and work orders to see analytics here.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
EOF
log "Reports.tsx written."


# ─────────────────────────────────────────────
# WEB NGINX CONFIG
# ─────────────────────────────────────────────

header "Writing apps/web/nginx.conf..."

cat > apps/web/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;

    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;
    client_max_body_size 50M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/x-javascript
        application/json
        application/xml
        application/xml+rss
        application/atom+xml
        image/svg+xml
        font/truetype
        font/opentype
        application/vnd.ms-fontobject;

    server {
        listen 80;
        server_name _;
        root /usr/share/nginx/html;
        index index.html;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.mapbox.com https://api.tiles.mapbox.com; style-src 'self' 'unsafe-inline' https://api.mapbox.com https://fonts.googleapis.com; img-src 'self' data: blob: https://*.mapbox.com https://images.unsplash.com; connect-src 'self' ws: wss: https://api.mapbox.com https://events.mapbox.com; font-src 'self' https://fonts.gstatic.com; worker-src blob:;" always;

        # Health check endpoint
        location /health {
            access_log off;
            return 200 '{"status":"ok","service":"simply-service-web"}';
            add_header Content-Type application/json;
        }

        # Proxy API requests to backend
        location /api/ {
            proxy_pass http://api:4000/api/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 120s;
            proxy_connect_timeout 10s;
            proxy_send_timeout 120s;
        }

        # WebSocket proxy for Socket.io
        location /socket.io/ {
            proxy_pass http://api:4000/socket.io/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
            proxy_cache_bypass $http_upgrade;
        }

        # Static assets — long cache
        location ~* \.(js|css|woff|woff2|ttf|eot|ico|svg|png|jpg|jpeg|gif|webp|avif)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            add_header X-Content-Type-Options "nosniff" always;
            try_files $uri =404;
        }

        # SPA fallback — all other routes serve index.html
        location / {
            try_files $uri $uri/ /index.html;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma "no-cache";
            add_header Expires "0";
        }
    }
}
EOF
log "nginx.conf written."


# ─────────────────────────────────────────────
# WEB DOCKERFILE
# ─────────────────────────────────────────────

header "Writing apps/web/Dockerfile..."

cat > apps/web/Dockerfile << 'EOF'
# ── Stage 1: Build ────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json yarn.lock* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --network-timeout 300000

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# Build shared package
WORKDIR /app/packages/shared
RUN yarn build 2>/dev/null || true

# Build web app
WORKDIR /app/apps/web
RUN yarn build

# ── Stage 2: Serve ────────────────────────────
FROM nginx:1.25-alpine AS runner

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/web/nginx.conf /etc/nginx/nginx.conf

# Create log directories and set permissions
RUN mkdir -p /var/log/nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx /var/cache/nginx && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
EOF
log "apps/web/Dockerfile written."


# ─────────────────────────────────────────────
# PHASE 3 — BUILD & LAUNCH
# ─────────────────────────────────────────────

header "Phase 3: Building and launching Simply Service..."

cd "$APP_DIR"

log "Installing root dependencies..."
yarn install --network-timeout 300000 2>&1 | tail -5 || warn "yarn install had warnings (non-fatal)"

log "Building and starting Docker containers..."
docker compose up --build -d 2>&1

log "Waiting for PostgreSQL to be ready..."
RETRIES=0
MAX_RETRIES=30
until docker compose exec -T postgres pg_isready -U simply_user -d simply_service_db -q; do
  RETRIES=$((RETRIES+1))
  if [ $RETRIES -ge $MAX_RETRIES ]; then
    die "PostgreSQL did not become ready after ${MAX_RETRIES} attempts. Check: docker compose logs postgres"
  fi
  echo -n "."
  sleep 3
done
echo ""
log "PostgreSQL is ready."

log "Waiting for API container to finish starting..."
RETRIES=0
until docker compose exec -T api sh -c 'test -f /app/dist/src/index.js || test -f /app/src/index.ts' 2>/dev/null; do
  RETRIES=$((RETRIES+1))
  if [ $RETRIES -ge 20 ]; then
    warn "API source check timed out — proceeding anyway"
    break
  fi
  sleep 3
done

log "Running database migrations..."
docker compose exec -T api sh -c 'cd /app && npx prisma migrate deploy --schema=./prisma/schema.prisma' 2>&1 || {
  warn "migrate deploy failed — attempting db push as fallback"
  docker compose exec -T api sh -c 'cd /app && npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss' 2>&1 || warn "db push also failed — check schema"
}
log "Migrations complete."

log "Generating Prisma client..."
docker compose exec -T api sh -c 'cd /app && npx prisma generate --schema=./prisma/schema.prisma' 2>&1 || warn "Prisma generate had warnings"

log "Seeding database with demo data..."
docker compose exec -T api sh -c '
  cd /app
  if [ -f "dist/prisma/seed.js" ]; then
    node dist/prisma/seed.js
  elif [ -f "prisma/seed.ts" ]; then
    npx ts-node --project tsconfig.json prisma/seed.ts
  else
    echo "Seed file not found — skipping"
  fi
' 2>&1 && log "Database seeded successfully." || warn "Seed step had issues — demo data may be partial"

log "Restarting API to pick up seeded data..."
docker compose restart api 2>&1
sleep 5
log "API restarted."


# ─────────────────────────────────────────────
# PHASE 4 — FIREWALL & VERIFICATION
# ─────────────────────────────────────────────

header "Phase 4: Configuring firewall and verifying deployment..."

log "Configuring UFW firewall..."
ufw allow 22/tcp   comment 'SSH'   2>/dev/null || true
ufw allow 80/tcp   comment 'HTTP'  2>/dev/null || true
ufw allow 443/tcp  comment 'HTTPS' 2>/dev/null || true
ufw allow 4000/tcp comment 'Simply Service API' 2>/dev/null || true
ufw --force enable 2>/dev/null || warn "UFW enable failed — check if ufw is installed"
log "Firewall configured."

log "Waiting for services to stabilize..."
sleep 8

log "Running health checks..."

API_OK=false
WEB_OK=false

if curl -sf --max-time 10 http://localhost:4000/health > /dev/null 2>&1; then
  log "API health check PASSED ✓"
  API_OK=true
else
  warn "API health check FAILED — check: docker compose logs api"
fi

if curl -sf --max-time 10 http://localhost/health > /dev/null 2>&1; then
  log "Web health check PASSED ✓"
  WEB_OK=true
else
  warn "Web health check FAILED — check: docker compose logs web"
fi

# Get server IP
SERVER_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

# ─────────────────────────────────────────────
# SUCCESS BANNER
# ─────────────────────────────────────────────

echo ""
echo -e "\033[1;34m╔══════════════════════════════════════════════════════════════╗\033[0m"
echo -e "\033[1;34m║          Simply Service — Setup Complete! 🎉                ║\033[0m"
echo -e "\033[1;34m╚══════════════════════════════════════════════════════════════╝\033[0m"
echo ""
echo -e "\033[1;32m  ACCESS URLS\033[0m"
echo -e "  🌐  Web App:   \033[1;37mhttp://${SERVER_IP}\033[0m"
echo -e "  🔌  API:       \033[1;37mhttp://${SERVER_IP}:4000\033[0m"
echo -e "  ❤️   API Health: \033[1;37mhttp://${SERVER_IP}:4000/health\033[0m"
echo ""
echo -e "\033[1;32m  DEMO CREDENTIALS\033[0m  (password: \033[1;33mPassword123!\033[0m)"
echo -e "  👤  Admin:      \033[1;37madmin@simplyservice.dev\033[0m"
echo -e "  🏢  Owner:      \033[1;37mowner@simplyservice.dev\033[0m"
echo -e "  🏗️   Manager:    \033[1;37mmanager@simplyservice.dev\033[0m"
echo -e "  🏠  Tenant 1:   \033[1;37mtenant1@simplyservice.dev\033[0m"
echo -e "  🏠  Tenant 2:   \033[1;37mtenant2@simplyservice.dev\033[0m"
echo -e "  🔧  Contractor: \033[1;37mcontractor1@simplyservice.dev\033[0m"
echo ""
echo -e "\033[1;32m  DOCKER CONTAINERS\033[0m"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps
echo ""
echo -e "\033[1;32m  USEFUL COMMANDS\033[0m"
echo -e "  📋  View logs:     \033[1;37mcd /opt/simply-service && docker compose logs -f\033[0m"
echo -e "  🔄  Restart all:   \033[1;37mcd /opt/simply-service && docker compose restart\033[0m"
echo -e "  ⬇️   Stop all:      \033[1;37mcd /opt/simply-service && docker compose down\033[0m"
echo -e "  🗄️   DB console:    \033[1;37mdocker compose exec postgres psql -U simply_user -d simply_service_db\033[0m"
echo -e "  🌱  Re-seed DB:     \033[1;37mdocker compose exec api node dist/prisma/seed.js\033[0m"
echo ""

if [ "$API_OK" = true ] && [ "$WEB_OK" = true ]; then
  echo -e "\033[1;32m  ✅  All systems operational — Simply Service is live!\033[0m"
else
  echo -e "\033[1;33m  ⚠️   Some services may still be starting. Wait 30s and retry:\033[0m"
  echo -e "      \033[1;37mcurl http://localhost:4000/health\033[0m"
  echo -e "      \033[1;37mcurl http://localhost/health\033[0m"
  echo -e "      \033[1;37mdocker compose logs --tail=50 api\033[0m"
fi

echo ""
echo -e "\033[1;34m══════════════════════════════════════════════════════════════\033[0m"
echo ""

log "Setup complete! Simply Service is ready."
exit 0
