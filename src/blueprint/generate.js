import fs from 'fs';
import chalk from 'chalk';

const amber = chalk.hex('#F5A623');
const muted = chalk.hex('#666666');
const success = chalk.hex('#4CAF50');

const stackLabels = {
  // frontend
  nextjs: 'Next.js',
  remix: 'Remix',
  nuxt: 'Nuxt',
  sveltekit: 'SvelteKit',
  astro: 'Astro',
  angular: 'Angular',
  vue: 'Vue + Vite',
  react: 'React + Vite',
  vanilla: 'Vanilla JS',
  html: 'HTML + CSS',
  // mobile
  expo: 'Expo (React Native)',
  rncli: 'React Native CLI',
  flutter: 'Flutter',
  ionic: 'Ionic',
  // backend
  node_express: 'Node.js + Express',
  node_fastify: 'Node.js + Fastify',
  node_hono: 'Node.js + Hono',
  python_django: 'Python + Django',
  python_fastapi: 'Python + FastAPI',
  python_flask: 'Python + Flask',
  ruby_rails: 'Ruby on Rails',
  java_spring: 'Java + Spring Boot',
  csharp_dotnet: 'C# + .NET',
  go_gin: 'Go + Gin',
  go_echo: 'Go + Echo',
  rust_axum: 'Rust + Axum',
  php_laravel: 'PHP + Laravel',
  // auth
  clerk: 'Clerk',
  'supabase-auth': 'Supabase Auth',
  nextauth: 'NextAuth / Auth.js',
  'firebase-auth': 'Firebase Auth',
  passport: 'Passport.js',
  devise: 'Devise',
  'django-auth': 'Django Auth',
  'aspnet-identity': 'ASP.NET Identity',
  // database
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  supabase: 'Supabase',
  neon: 'Neon',
  planetscale: 'PlanetScale',
  mongodb: 'MongoDB Atlas',
  firestore: 'Firestore',
  powersync: 'PowerSync + Supabase',
  upstash: 'Upstash Redis',
  redis: 'Redis',
  dynamodb: 'DynamoDB',
  // orm
  prisma: 'Prisma',
  drizzle: 'Drizzle',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
  sqlalchemy: 'SQLAlchemy',
  activerecord: 'ActiveRecord',
  hibernate: 'Hibernate',
  efcore: 'Entity Framework Core',
  // storage
  'supabase-storage': 'Supabase Storage',
  s3: 'AWS S3',
  r2: 'Cloudflare R2',
  uploadthing: 'UploadThing',
  gcs: 'Google Cloud Storage',
  // payments
  stripe: 'Stripe',
  lemon: 'Lemon Squeezy',
  paddle: 'Paddle',
  braintree: 'Braintree',
  // cms
  sanity: 'Sanity',
  contentful: 'Contentful',
  payload: 'Payload CMS',
  keystatic: 'Keystatic',
  strapi: 'Strapi',
  wordpress: 'WordPress (headless)',
  // realtime
  'supabase-realtime': 'Supabase Realtime',
  pusher: 'Pusher',
  stream: 'Stream',
  ably: 'Ably',
  soketi: 'Soketi',
  // email
  resend: 'Resend',
  sendgrid: 'SendGrid',
  postmark: 'Postmark',
  mailgun: 'Mailgun',
  ses: 'AWS SES',
  none: 'None — skip for now',
  // deployment
  vercel: 'Vercel',
  railway: 'Railway',
  fly: 'Fly.io',
  render: 'Render',
  aws: 'AWS',
  gcp: 'Google Cloud',
  azure: 'Azure',
  cloudflare: 'Cloudflare Pages',
  heroku: 'Heroku',
  digitalocean: 'DigitalOcean',
  self: 'Self-hosted',
};

function label(value) {
  return stackLabels[value] ?? value;
}

function buildStackSection(stack) {
  const lines = [];
  if (stack.frontend) lines.push(`| Frontend       | ${label(stack.frontend)} |`);
  if (stack.mobile) lines.push(`| Mobile         | ${label(stack.mobile)} |`);
  if (stack.backend) lines.push(`| Backend        | ${label(stack.backend)} |`);
  if (stack.auth) lines.push(`| Auth           | ${label(stack.auth)} |`);
  if (stack.database) lines.push(`| Database       | ${label(stack.database)} |`);
  if (stack.orm) lines.push(`| ORM            | ${label(stack.orm)} |`);
  if (stack.storage) lines.push(`| Storage        | ${label(stack.storage)} |`);
  if (stack.payments) lines.push(`| Payments       | ${label(stack.payments)} |`);
  if (stack.cms) lines.push(`| CMS            | ${label(stack.cms)} |`);
  if (stack.realtime) lines.push(`| Realtime       | ${label(stack.realtime)} |`);
  if (stack.email) lines.push(`| Email          | ${label(stack.email)} |`);
  if (stack.deployment) lines.push(`| Deployment     | ${label(stack.deployment)} |`);
  return lines.join('\n');
}

function buildOpenQuestions(interview, stack) {
  const questions = [];

  if (interview.auth === 'unsure') {
    questions.push('- Do users need accounts? Auth strategy not yet decided.');
  }
  if (interview.database === 'unsure') {
    questions.push('- Does this need a database? Not yet confirmed.');
  }
  if (interview.payments === 'later') {
    questions.push('- Payments deferred — revisit before launch.');
  }
  if (interview.offline === 'unsure') {
    questions.push('- Offline support not yet decided — affects database choice.');
  }
  if (stack.email === 'none') {
    questions.push('- Email provider not selected — needed before sending any transactional email.');
  }
  if (interview.constraints) {
    questions.push(`- Constraints noted: "${interview.constraints}" — verify these are addressed in the stack.`);
  }

  return questions.length > 0
    ? questions.join('\n')
    : '- None — all decisions made.';
}

function buildPostBuildChecklist(stack, agent) {
  const items = [];

  items.push('- [ ] Fill in `.env` with real API keys from each service');

  if (stack.database && stack.database !== 'none') {
    items.push('- [ ] Run database migrations');
  }
  if (stack.auth && stack.auth !== 'none') {
    items.push('- [ ] Configure auth provider — add callback URLs, set up roles');
  }
  if (stack.payments) {
    items.push('- [ ] Set up Stripe webhooks and test with Stripe CLI');
  }
  if (stack.cms) {
    items.push('- [ ] Configure CMS — set up schemas, invite content editors');
  }
  if (stack.deployment) {
    items.push(`- [ ] Connect repository to ${label(stack.deployment)} and configure environment variables`);
  }
  if (agent?.mcpEnabled) {
    items.push('- [ ] Review CLAUDE.md — add project-specific rules and conventions');
  }

  return items.join('\n');
}

export function generateBlueprint(session) {
  const { project, interview, stack, agent } = session;

  const agentFiles = agent?.contextFiles?.join(', ') ?? 'AGENT.md';

  const content = `# ${project.name}

> ${interview.purpose}

---

## Purpose

${interview.purpose}

## Users

${interview.users}

## Platform

${interview.platform === 'web' ? 'Web application' :
    interview.platform === 'mobile' ? 'Mobile application (iOS + Android)' :
    interview.platform === 'desktop' ? 'Desktop application' :
    interview.platform === 'api' ? 'API / Backend service' :
    interview.platform === 'marketing' ? 'Marketing site' :
    interview.platform === 'both' ? 'Web + Mobile' : interview.platform}

## Auth

${interview.auth === 'yes' ? 'Users require accounts — sign up, sign in, session management.' :
    interview.auth === 'no' ? 'No authentication required.' :
    'Auth not yet decided.'}

## Core Features

_Define your core features here. groundup has captured your decisions — this section is yours to fill in._

## Stack

| Layer          | Choice |
|----------------|--------|
${buildStackSection(stack)}

## Agent Context

| Agent          | Context File |
|----------------|--------------|
${(agent?.all ?? []).map((a, i) => `| ${i === 0 ? 'Primary' : 'Secondary'}: ${a} | ${agent.contextFiles[i]} |`).join('\n')}

## Open Questions

${buildOpenQuestions(interview, stack)}

## Post-Build Checklist

${buildPostBuildChecklist(stack, agent)}

---

_Generated by groundup v1.0.0 — ${new Date().toISOString()}_
`;

  fs.writeFileSync('BLUEPRINT.md', content);
  return content;
}