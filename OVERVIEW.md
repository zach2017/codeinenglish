# React + Express + Prisma + Postgres Starter

A minimal but complete starter:

- **Frontend:** Vite + React + TypeScript + React Router
- **Backend:** Express + TypeScript + Prisma
- **Database:** PostgreSQL (Docker for local; Amazon RDS for prod)
- **Infra (optional):** AWS with Terraform (VPC, RDS, ECS Fargate, ALB + ACM, WAF, S3 + CloudFront)
- **Security:** Sensible defaults + hardening checklist and code snippets

---

## Table of Contents

1. [Quick Start (Local Dev)](#quick-start-local-dev)
2. [Project Structure](#project-structure)
3. [Environment Variables](#environment-variables)
4. [Prisma & Database](#prisma--database)
5. [Development Commands](#development-commands)
6. [Security Hardening for Production](#security-hardening-for-production)
   - [Express/Node](#expressnode)
   - [PostgreSQL](#postgresql)
   - [Secrets Management](#secrets-management)
   - [TLS/HTTPS & Reverse Proxy](#tlshttps--reverse-proxy)
   - [CORS & CSP](#cors--csp)
   - [Auth & Session](#auth--session)
   - [Observability](#observability)
   - [Supply Chain & Container Security](#supply-chain--container-security)
7. [Dockerization (Prod Builds)](#dockerization-prod-builds)
8. [AWS Deployment with Terraform](#aws-deployment-with-terraform)
   - [Architecture](#architecture)
   - [Terraform Layout](#terraform-layout)
   - [Terraform Snippets](#terraform-snippets)
   - [Deploy Steps](#deploy-steps)
9. [CI/CD (GitHub Actions example)](#cicd-github-actions-example)
10. [Runbook: Migrations, Backups, Rotations](#runbook-migrations-backups-rotations)
11. [FAQ](#faq)

---

## Quick Start (Local Dev)

**Prereqs:** Node 18+, Docker, npm

```bash
# 1) Start Postgres locally via Docker
docker compose up -d

# 2) Install deps
cd server && npm i
cd ../client && npm i

# 3) Prepare DB & seed sample data
cd ../server
cp .env.example .env          # adjust if needed
npx prisma migrate dev --name init
npm run seed

# 4) Run dev servers (in two terminals)
# A) API
cd server
npm run dev

# B) Client
cd ../client
npm run dev
```

- Frontend → http://localhost:5173
- API → http://localhost:4000 (Health: `/api/health`)
- Client uses `VITE_API_URL` from `client/.env` (defaults to `http://localhost:4000`).

---

## Project Structure

```
react-prisma-postgres-starter/
├─ docker-compose.yml           # Local Postgres
├─ client/                      # Vite + React + TS + React Router
│  ├─ src/
│  ├─ vite.config.ts
│  └─ .env
└─ server/                      # Express + TS + Prisma
   ├─ prisma/
   │  ├─ schema.prisma
   │  └─ seed.ts
   ├─ src/
   │  └─ index.ts               # API routes
   ├─ .env.example
   ├─ package.json
   └─ tsconfig.json
```

---

## Environment Variables

**server/.env**

```
# Database (for local dev; prod uses Secrets Manager)
DATABASE_URL="postgresql://appuser:appsecret@localhost:5432/appdb?schema=public"

# API port
PORT=4000

# (Recommended for prod)
# CORS_ORIGIN="https://your-frontend-domain.com"
# NODE_ENV="production"
# LOG_LEVEL="info"
# RATE_LIMIT_WINDOW_MS="60000"
# RATE_LIMIT_MAX="100"
```

**client/.env**

```
VITE_API_URL="http://localhost:4000"
```

---

## Prisma & Database

- Data model: `User` and `Task`, with `Task.userId` referencing `User.id`.
- Typical commands:

```bash
# After editing prisma/schema.prisma
npx prisma generate

# Create/alter tables (dev migrations)
npx prisma migrate dev --name <change>

# Reset DB during dev
npx prisma migrate reset

# Seed
npm run seed
```

- Connect to local Postgres: `psql -h localhost -U appuser -d appdb` (password `appsecret` by default from docker-compose).

---

## Development Commands

**server**

```bash
npm run dev          # ts-node-dev, hot reload
npm run build        # tsc build to dist/
npm start            # run compiled JS
npm run seed         # seed sample data
```

**client**

```bash
npm run dev          # Vite dev server
npm run build        # Vite build
npm run preview      # Preview built app
```

---

## Security Hardening for Production

This starter is intentionally simple. For production, apply the following hardening patterns.

### Express/Node

1. **Helmet** (secure headers) + **HSTS** in HTTPS environments.
2. **CORS**: strict allowlist of your front-end origins.
3. **Rate limiting** & **request body size limits**.
4. **Avoid leaking stack traces**; return generic 500s, log details server-side.
5. **Input validation** for every endpoint (we use Zod already).
6. **Structured logging** (pino/winston) with PII redaction.
7. **Disable `x-powered-by`**.
8. **Health endpoint** should not leak environment/version info.
9. **Graceful shutdown** to close DB connections on SIGTERM.
10. **Prisma**: tune pool size & timeouts for your infra.

**Example additions** (`server/src/index.ts`):

```ts
// Add these deps: npm i helmet express-rate-limit compression hpp morgan
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import hpp from 'hpp';
import morgan from 'morgan';

app.disable('x-powered-by');

app.use(helmet({
  // If behind a trusted proxy/ALB/CloudFront and always HTTPS, enable HSTS:
  // hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// Trust proxy if running behind ALB/NGINX/CloudFront
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '1mb' }));
app.use(hpp());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
```

### PostgreSQL

- **Network isolation**: RDS in **private subnets** only.
- **TLS in transit**: require SSL from the app; set `sslmode=require` and use AWS RDS CA bundle.
- **Encryption at rest**: RDS with KMS CMK.
- **Auth**: strong password policy or IAM Auth for Postgres.
- **Least privilege**: separate migration user vs. runtime user with restricted privileges.
- **Backups**: automated snapshots; PITR enabled; test restores.
- **Maintenance**: automatic minor upgrades; maintenance windows; alarms on CPU/storage/connections.

### Secrets Management

- **Never commit `.env`** with real secrets.
- Use **AWS Secrets Manager** (or SSM Parameter Store) for `DATABASE_URL`, API secrets, etc.
- Attach **least-privilege IAM roles** to ECS tasks to read specific secrets.
- Rotate secrets regularly; rotate DB passwords with RDS-compatible rotation.

### TLS/HTTPS & Reverse Proxy

- Public traffic → **CloudFront** (static SPA) and **ALB** (API).
- Use **ACM** certificates for both; only TLS 1.2+.
- Enable **HSTS** and **secure cookies** if you use cookies.

### CORS & CSP

- CORS allowlist only your SPA domains (prod + staging).
- Use `helmet` to set **Content-Security-Policy** on any rendered HTML (the API here is JSON-only; CSP mainly affects static hosting).

**Strict CORS example:**

```ts
import cors from 'cors';

const allowed = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: function (origin, cb) {
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
```

### Auth & Session

- This starter is open; for prod add **JWT or OIDC (Keycloak/Cognito/Auth0)**.
- If using cookies, set `SameSite=Lax|Strict`, `Secure`, and **CSRF protection** (tokens or double-submit).
- Implement **role-based access control** where appropriate.

### Observability

- **CloudWatch logs**, metrics, alarms.
- Structured app logs (JSON) + **trace IDs**.
- Health checks + `/ready` for container orchestration.

### Supply Chain & Container Security

- Pin Node & base images; use **multi-stage builds**.
- Run as **non-root**; drop Linux capabilities.
- Scan images (e.g., Trivy); use **Dependabot**/**npm audit**.
- Lockfiles committed (`package-lock.json`/`pnpm-lock.yaml`).

---

## Dockerization (Prod Builds)

**server/Dockerfile** (example)

```Dockerfile
# ---- build ----
FROM node:20-bookworm AS build
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev=false
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:20-bookworm
ENV NODE_ENV=production
RUN useradd -m nodeuser
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
USER nodeuser
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

**client/Dockerfile** (example)

```Dockerfile
# ---- build ----
FROM node:20-bookworm AS build
WORKDIR /app
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- serve static via nginx ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

---

## AWS Deployment with Terraform

### Architecture

- **VPC** with public & private subnets across at least 2 AZs.
- **RDS Postgres** in private subnets (encrypted, backups enabled).
- **ECS Fargate** service for API in private subnets, fronted by **ALB** in public subnets.
- **ACM** cert for your domain; **Route53** alias → ALB.
- **WAF** attached to ALB (managed rules + rate limiting).
- **S3 + CloudFront** for SPA hosting (OAC, encryption, no public bucket).
- **Secrets Manager** for `DATABASE_URL` & other secrets (KMS).
- **CloudWatch** for logs/alarms.
- Optional: **VPC endpoints** for Secrets Manager/SSM.

### Terraform Layout

```
infra/
├─ providers.tf
├─ variables.tf
├─ vpc.tf
├─ rds.tf
├─ ecr.tf
├─ ecs_api.tf
├─ alb.tf
├─ acm_route53.tf
├─ s3_cloudfront_spa.tf
├─ waf.tf
├─ secrets.tf
├─ iam.tf
└─ outputs.tf
```

### Terraform Snippets

**providers.tf**

```hcl
terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "your-tf-state-bucket"
    key    = "react-prisma/stage/terraform.tfstate"
    region = "us-east-1"
    dynamodb_table = "your-tf-locks"
    encrypt = true
  }
}

provider "aws" {
  region = var.region
}
```

**variables.tf** (key examples)

```hcl
variable "region" { type = string }
variable "project" { type = string }
variable "domain_name" { type = string }         # api.example.com for ALB
variable "spa_domain_name" { type = string }     # app.example.com for CloudFront
variable "db_username" { type = string }
variable "db_password" {
  type      = string
  sensitive = true
}
```

**vpc.tf** (using AWS VPC module for brevity)

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = { Project = var.project }
}
```

**rds.tf**

```hcl
resource "aws_db_subnet_group" "rds" {
  name       = "${var.project}-rds-subnets"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "rds" {
  name        = "${var.project}-rds-sg"
  description = "Allow Postgres from ECS"
  vpc_id      = module.vpc.vpc_id
  ingress {
    protocol  = "tcp"
    from_port = 5432
    to_port   = 5432
    security_groups = [aws_security_group.ecs_tasks.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier         = "${var.project}-pg"
  engine             = "postgres"
  engine_version     = "16.3"
  instance_class     = "db.t4g.micro"
  username           = var.db_username
  password           = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.rds.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  allocated_storage  = 20
  storage_encrypted  = true
  deletion_protection = true
  backup_retention_period = 7
  multi_az           = false
  publicly_accessible = false
  skip_final_snapshot = false
  auto_minor_version_upgrade = true
}
```

**ecr.tf**

```hcl
resource "aws_ecr_repository" "api" {
  name = "${var.project}-api"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}

resource "aws_ecr_repository" "client" {
  name = "${var.project}-client"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}
```

**ecs_api.tf** (essentials only)

```hcl
resource "aws_ecs_cluster" "this" {
  name = "${var.project}-cluster"
}

resource "aws_security_group" "ecs_tasks" {
  name   = "${var.project}-ecs-tasks"
  vpc_id = module.vpc.vpc_id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_iam_role" "ecs_task_exec" {
  name = "${var.project}-ecs-task-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = { Service = "ecs-tasks.amazonaws.com" },
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "exec_policy" {
  role       = aws_iam_role.ecs_task_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}/api"
  retention_in_days = 30
}

# Replace <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/<repo>:<tag> during deploy
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_exec.arn
  task_role_arn            = aws_iam_role.ecs_task_exec.arn

  container_definitions = jsonencode([{
    name  = "api"
    image = "<ECR_API_IMAGE>"
    essential = true
    portMappings = [{ containerPort = 4000 }]
    environment = [
      { name = "NODE_ENV", value = "production" }
    ]
    secrets = [
      # DATABASE_URL from Secrets Manager via task role
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret_version.database_url.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}
```

**alb.tf**

```hcl
resource "aws_security_group" "alb" {
  name   = "${var.project}-alb"
  vpc_id = module.vpc.vpc_id
  ingress {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "this" {
  name               = "${var.project}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project}-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"
  health_check {
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.cert.certificate_arn
  default_action {
    type = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_ecs_service" "api" {
  name            = "${var.project}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = module.vpc.private_subnets
    security_groups = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }
}
```

**acm_route53.tf**

```hcl
data "aws_route53_zone" "this" {
  name = regex("\\.$", var.domain_name) != "" ? var.domain_name : "${var.domain_name}."
  private_zone = false
}

resource "aws_acm_certificate" "cert" {
  domain_name       = var.domain_name
  validation_method = "DNS"
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
  zone_id = data.aws_route53_zone.this.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "cert" {
  certificate_arn         = aws_acm_certificate.cert.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

resource "aws_route53_record" "api_alias" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = false
  }
}
```

**s3_cloudfront_spa.tf** (essentials)

```hcl
resource "aws_s3_bucket" "spa" {
  bucket = "${var.project}-spa-${var.region}"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "spa" {
  bucket                  = aws_s3_bucket.spa.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "${var.project}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "spa" {
  enabled             = true
  default_root_object = "index.html"
  origins {
    domain_name = aws_s3_bucket.spa.bucket_regional_domain_name
    origin_id   = "spa-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }
  default_cache_behavior {
    target_origin_id       = "spa-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
  }
  viewer_certificate {
    acm_certificate_arn = aws_acm_certificate_validation.cert.certificate_arn
    ssl_support_method  = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
```

**waf.tf**

```hcl
resource "aws_wafv2_web_acl" "this" {
  name        = "${var.project}-waf"
  scope       = "REGIONAL"
  description = "Protect ALB"
  default_action { allow {} }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-waf"
    sampled_requests_enabled   = true
  }
  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action { none {} }
    statement { managed_rule_group_statement {
      name        = "AWSManagedRulesCommonRuleSet"
      vendor_name = "AWS"
    }}
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }
  rule {
    name     = "RateLimit"
    priority = 10
    statement { rate_based_statement {
      limit              = 2000
      aggregate_key_type = "IP"
    }}
    action { block {} }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.this.arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}
```

**secrets.tf** (example: store DATABASE_URL & inject to ECS)

```hcl
resource "aws_secretsmanager_secret" "database_url" {
  name = "${var.project}/DATABASE_URL"
  kms_key_id = null # or a customer-managed KMS key ARN
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.address}:5432/${aws_db_instance.postgres.db_name}?sslmode=require"
}
```

### Deploy Steps

1. **Build & push images** to ECR (server, client).  
2. **Run Terraform** to create/upgrade infra.
3. **Upload SPA build** to S3, **invalidate CloudFront**.
4. **Run Prisma migrations** via a one-off ECS task using the same image as API:
   ```bash
   npx prisma migrate deploy
   ```
5. **Smoke test**: ALB HTTPS `/api/health`; CloudFront SPA loads; API calls succeed.

---

## CI/CD (GitHub Actions example)

```yaml
name: deploy
on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with: { node-version: 20 }

      # Build server
      - run: |
          cd server
          npm ci
          npm run build

      # Build client
      - run: |
          cd client
          npm ci
          npm run build

      # Login to ECR (configure AWS creds via OIDC & role-to-assume)
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::<ACCOUNT_ID>:role/<ROLE_NAME>
          aws-region: us-east-1

      - uses: aws-actions/amazon-ecr-login@v2

      # Tag & push images...
      # Then: terraform init/plan/apply in infra/
```

---

## Runbook: Migrations, Backups, Rotations

- **DB Migrations**: never auto-run on boot in prod. Use `prisma migrate deploy` via one-off job.
- **Backups**: RDS automated snapshots + PITR. Test restore **quarterly**.
- **Secret Rotation**: update DB password, update Secrets Manager, rotate ECS task (new deployment). Consider RDS rotation.
- **Scaling**: adjust ECS desired count and ALB target health; set CPU/Memory autoscaling policies.
- **Incident response**: WAF blocks → CloudWatch alarms; rollback via previous task definition revision.

---

## FAQ

**Q: Can I use Cognito instead of Keycloak/Auth0?**  
A: Yes—protect the API with Cognito JWTs verified in Express middleware; front-end uses Hosted UI or custom flow.

**Q: How do I enable SSL for local Postgres?**  
A: For local dev usually not necessary; for prod RDS requires TLS—use `sslmode=require` and RDS CA cert in your container image or OS trust store.

**Q: Can I switch to a monorepo tool?**  
A: Yes—pnpm workspaces or Turborepo works great here.

---

**Happy shipping! Secure by default, observable by design.**


---

## Run Local Dev Fully in Docker

```bash
# from repo root
docker compose -f docker-compose.dev.yml up --build
# client : http://localhost:5173
# api    : http://localhost:4000/api/health
# db     : localhost:5432 (appuser/appsecret)
```

## Build & Run Prod-like with Docker Compose

```bash
docker compose up --build -d
# client: http://localhost:8080
# api   : http://localhost:4000
```

## Terraform

A scaffolded `infra/` folder is included. Fill the placeholders in `providers.tf` backend block
and variables in `variables.tf`, then:

```bash
cd infra
terraform init
terraform apply -var='domain_name=api.example.com' -var='spa_domain_name=app.example.com' -var='db_username=appuser' -var='db_password=********'
```

Remember to push your built images to ECR and update `<ECR_API_IMAGE>` in `ecs_api.tf`
before applying.
