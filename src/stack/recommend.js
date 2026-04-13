export function getRecommendations(interview) {
  const recommendations = {};

  // FRONTEND FRAMEWORK
  if (interview.frontend_framework && interview.frontend_framework !== 'unsure') {
    // developer already told us — confirm their choice, no recommendation needed
    recommendations.frontend = {
      recommended: interview.frontend_framework,
      reason: `You said ${interview.frontend_framework}. Confirmed.`,
      options: [
        { value: interview.frontend_framework, label: interview.frontend_framework, hint: 'your choice' },
        { value: 'other', label: 'Actually, change this', hint: 'pick something else' },
      ],
    };
  } else if (!interview.frontend_framework && (interview.platform === 'web' || interview.platform === 'both' || interview.platform === 'marketing')) {
    // they said unsure — recommend based on context
    const isMarketing = interview.platform === 'marketing';
    const isContentHeavy = interview.content === 'yes';

    recommendations.frontend = {
      recommended: isMarketing || isContentHeavy ? 'astro' : 'nextjs',
      reason: isMarketing || isContentHeavy
        ? 'Content-first project. Astro ships zero JS by default — fast, SEO-friendly.'
        : 'Web app. Next.js covers full stack in one framework — API routes, server components, Vercel native.',
      options: [
        { value: 'nextjs', label: 'Next.js', hint: 'React, full stack' },
        { value: 'remix', label: 'Remix', hint: 'React, data-heavy' },
        { value: 'nuxt', label: 'Nuxt', hint: 'Vue, full stack' },
        { value: 'sveltekit', label: 'SvelteKit', hint: 'Svelte, full stack' },
        { value: 'astro', label: 'Astro', hint: 'content-first, minimal JS' },
        { value: 'angular', label: 'Angular', hint: 'opinionated, enterprise-ready' },
        { value: 'vue', label: 'Vue + Vite', hint: 'Vue SPA' },
        { value: 'react', label: 'React + Vite', hint: 'React SPA' },
        { value: 'vanilla', label: 'Vanilla JS', hint: 'no framework' },
        { value: 'html', label: 'HTML + CSS only', hint: 'static, no JS' },
        { value: 'other', label: 'Other', hint: 'tell me in constraints' },
      ],
    };
  }

  // MOBILE FRAMEWORK
  if (interview.platform === 'mobile' || interview.platform === 'both') {
    if (interview.mobile_framework && interview.mobile_framework !== 'unsure') {
      recommendations.mobile = {
        recommended: interview.mobile_framework,
        reason: `You said ${interview.mobile_framework}. Confirmed.`,
        options: [
          { value: interview.mobile_framework, label: interview.mobile_framework, hint: 'your choice' },
          { value: 'other', label: 'Actually, change this', hint: 'pick something else' },
        ],
      };
    } else {
      recommendations.mobile = {
        recommended: 'expo',
        reason: 'Mobile first. Expo handles iOS and Android with one codebase and manages your App Store pipeline.',
        options: [
          { value: 'expo', label: 'Expo', hint: 'recommended — managed workflow, EAS builds' },
          { value: 'rncli', label: 'React Native CLI', hint: 'more control, more setup' },
          { value: 'flutter', label: 'Flutter', hint: 'Dart, cross-platform' },
          { value: 'ionic', label: 'Ionic', hint: 'web-based, hybrid' },
          { value: 'other', label: 'Other', hint: 'tell me what you want' },
        ],
      };
    }
  }

  // BACKEND
  if (interview.backend === 'yes') {
    if (interview.backend_language && interview.backend_language !== 'unsure') {
      recommendations.backend = {
        recommended: interview.backend_language,
        reason: `You said ${interview.backend_language}. Confirmed.`,
        options: [
          { value: interview.backend_language, label: interview.backend_language, hint: 'your choice' },
          { value: 'other', label: 'Actually, change this', hint: 'pick something else' },
        ],
      };
    } else {
      recommendations.backend = {
        recommended: 'node_express',
        reason: 'Node.js + Express is the most flexible starting point — huge ecosystem, well documented, easy to hire for.',
        options: [
          { value: 'node_express', label: 'Node.js + Express', hint: 'JavaScript, battle-tested' },
          { value: 'node_fastify', label: 'Node.js + Fastify', hint: 'JavaScript, high performance' },
          { value: 'node_hono', label: 'Node.js + Hono', hint: 'JavaScript, edge-ready' },
          { value: 'python_django', label: 'Python + Django', hint: 'batteries included, ORM built in' },
          { value: 'python_fastapi', label: 'Python + FastAPI', hint: 'async, great for APIs' },
          { value: 'python_flask', label: 'Python + Flask', hint: 'minimal, flexible' },
          { value: 'ruby_rails', label: 'Ruby on Rails', hint: 'convention over configuration' },
          { value: 'java_spring', label: 'Java + Spring Boot', hint: 'enterprise, object-oriented' },
          { value: 'csharp_dotnet', label: 'C# + .NET', hint: 'Microsoft ecosystem, enterprise' },
          { value: 'go_gin', label: 'Go + Gin', hint: 'fast, lightweight' },
          { value: 'go_echo', label: 'Go + Echo', hint: 'fast, minimal' },
          { value: 'rust_axum', label: 'Rust + Axum', hint: 'performance critical' },
          { value: 'php_laravel', label: 'PHP + Laravel', hint: 'popular, full featured' },
          { value: 'other', label: 'Other', hint: 'tell me what you want' },
        ],
      };
    }
  }

  // AUTH — only if user said yes
  if (interview.auth === 'yes') {
    recommendations.auth = {
      recommended: 'clerk',
      reason: 'You need auth. Clerk handles sign up, sign in, sessions, and invite flows out of the box.',
      options: [
        { value: 'clerk', label: 'Clerk', hint: 'recommended — fastest to ship' },
        { value: 'supabase-auth', label: 'Supabase Auth', hint: 'if you\'re already on Supabase' },
        { value: 'nextauth', label: 'NextAuth / Auth.js', hint: 'open source, self-hosted' },
        { value: 'firebase-auth', label: 'Firebase Auth', hint: 'Google ecosystem' },
        { value: 'passport', label: 'Passport.js', hint: 'Node.js, flexible strategies' },
        { value: 'devise', label: 'Devise', hint: 'Rails standard' },
        { value: 'django-auth', label: 'Django Auth', hint: 'built into Django' },
        { value: 'aspnet-identity', label: 'ASP.NET Identity', hint: '.NET standard' },
        { value: 'other', label: 'Other', hint: 'tell me what you want' },
      ],
    };
  }

  // DATABASE — only if they need one and don't have one
  if (interview.database === 'yes_new') {
    if (interview.offline === 'yes') {
      recommendations.database = {
        recommended: 'powersync',
        reason: 'You need offline support. PowerSync sits on Supabase and gives you local-first sync with conflict resolution.',
        options: [
          { value: 'powersync', label: 'PowerSync + Supabase', hint: 'recommended — offline first' },
          { value: 'sqlite', label: 'SQLite', hint: 'embedded, zero config' },
          { value: 'pocketbase', label: 'PocketBase', hint: 'self-hosted, simpler' },
          { value: 'other', label: 'Other', hint: 'tell me what you want' },
        ],
      };
    } else if (interview.database_type === 'relational' || interview.database_type === 'unsure') {
      recommendations.database = {
        recommended: 'postgres',
        reason: 'Relational data. PostgreSQL is the most capable open-source relational database — runs everywhere.',
        options: [
          { value: 'postgres', label: 'PostgreSQL', hint: 'recommended — powerful, open source' },
          { value: 'mysql', label: 'MySQL', hint: 'widely used, well supported' },
          { value: 'sqlite', label: 'SQLite', hint: 'embedded, great for small projects' },
          { value: 'supabase', label: 'Supabase', hint: 'Postgres + auth + storage + realtime' },
          { value: 'neon', label: 'Neon', hint: 'serverless Postgres' },
          { value: 'planetscale', label: 'PlanetScale', hint: 'serverless MySQL' },
          { value: 'other', label: 'Other', hint: 'tell me what you want' },
        ],
      };
    } else if (interview.database_type === 'document') {
      recommendations.database = {
        recommended: 'mongodb',
        reason: 'Document storage. MongoDB Atlas is the standard for flexible JSON data.',
        options: [
          { value: 'mongodb', label: 'MongoDB Atlas', hint: 'recommended — flexible, scalable' },
          { value: 'firestore', label: 'Firestore', hint: 'Google ecosystem' },
          { value: 'couchdb', label: 'CouchDB', hint: 'open source, sync friendly' },
          { value: 'pocketbase', label: 'PocketBase', hint: 'self-hosted, simpler' },
          { value: 'other', label: 'Other', hint: 'tell me what you want' },
        ],
      };
    } else if (interview.database_type === 'keyvalue') {
      recommendations.database = {
        recommended: 'upstash',
        reason: 'Key/value storage. Upstash gives you serverless Redis — fast, cheap, zero ops.',
        options: [
          { value: 'upstash', label: 'Upstash Redis', hint: 'recommended — serverless Redis' },
          { value: 'redis', label: 'Redis', hint: 'self-hosted' },
          { value: 'dynamodb', label: 'DynamoDB', hint: 'AWS ecosystem' },
          { value: 'other', label: 'Other', hint: 'tell me what you want' },
        ],
      };
    }
  }

  // ORM — only if they need a database and want one
  if (
    (interview.database === 'yes_new' || interview.database === 'yes_existing') &&
    interview.orm === 'yes'
  ) {
    const lang = interview.backend_language ?? '';
    let recommended = 'prisma';
    let reason = 'Prisma is the most developer-friendly ORM for Node.js — type-safe, great migrations.';

    if (lang.startsWith('python')) {
      recommended = 'sqlalchemy';
      reason = 'SQLAlchemy is the standard ORM for Python — powerful, flexible, works with any DB.';
    } else if (lang === 'ruby_rails') {
      recommended = 'activerecord';
      reason = 'ActiveRecord is built into Rails — convention over configuration, zero setup.';
    } else if (lang === 'java_spring') {
      recommended = 'hibernate';
      reason = 'Hibernate is the standard ORM for Java — mature, enterprise-grade.';
    } else if (lang === 'csharp_dotnet') {
      recommended = 'efcore';
      reason = 'Entity Framework Core is the standard ORM for .NET — first-class Microsoft support.';
    }

    recommendations.orm = {
      recommended,
      reason,
      options: [
        { value: 'prisma', label: 'Prisma', hint: 'Node.js, type-safe, great DX' },
        { value: 'drizzle', label: 'Drizzle', hint: 'Node.js, lightweight, SQL-like' },
        { value: 'typeorm', label: 'TypeORM', hint: 'Node.js, decorator-based, OOP' },
        { value: 'sequelize', label: 'Sequelize', hint: 'Node.js, battle-tested' },
        { value: 'sqlalchemy', label: 'SQLAlchemy', hint: 'Python, powerful' },
        { value: 'activerecord', label: 'ActiveRecord', hint: 'Rails built-in' },
        { value: 'hibernate', label: 'Hibernate', hint: 'Java, enterprise' },
        { value: 'efcore', label: 'Entity Framework Core', hint: '.NET standard' },
        { value: 'other', label: 'Other', hint: 'tell me what you want' },
      ],
    };
  }

  // FILE STORAGE — only if they said yes
  if (interview.file_storage === 'yes') {
    recommendations.storage = {
      recommended: 'supabase-storage',
      reason: 'You need file storage. Supabase Storage handles uploads, access control, and CDN delivery.',
      options: [
        { value: 'supabase-storage', label: 'Supabase Storage', hint: 'recommended — simple, integrated' },
        { value: 's3', label: 'AWS S3', hint: 'powerful, industry standard' },
        { value: 'r2', label: 'Cloudflare R2', hint: 'cheaper than S3, compatible API' },
        { value: 'uploadthing', label: 'UploadThing', hint: 'developer-friendly, Next.js native' },
        { value: 'gcs', label: 'Google Cloud Storage', hint: 'GCP ecosystem' },
        { value: 'other', label: 'Other', hint: 'tell me what you want' },
      ],
    };
  }

  // PAYMENTS — only if charging users
  if (interview.payments === 'yes_charge') {
    recommendations.payments = {
      recommended: 'stripe',
      reason: 'You\'re charging users. Stripe is the standard — subscriptions, one-time payments, invoicing.',
      options: [
        { value: 'stripe', label: 'Stripe', hint: 'recommended — industry standard' },
        { value: 'lemon', label: 'Lemon Squeezy', hint: 'simpler, handles tax automatically' },
        { value: 'paddle', label: 'Paddle', hint: 'merchant of record' },
        { value: 'braintree', label: 'Braintree', hint: 'PayPal ecosystem' },
        { value: 'other', label: 'Other', hint: 'tell me what you want' },
      ],
    };
  }

  // CMS — only if they said yes
  if (interview.content === 'yes') {
    recommendations.cms = {
      recommended: 'sanity',
      reason: 'You need a CMS. Sanity is flexible, developer-friendly, and pairs cleanly with any framework.',
      options: [
        { value: 'sanity', label: 'Sanity', hint: 'recommended — flexible, great DX' },
        { value: 'contentful', label: 'Contentful', hint: 'enterprise, well established' },
        { value: 'payload', label: 'Payload CMS', hint: 'open source, self-hosted' },
        { value: 'keystatic', label: 'Keystatic', hint: 'git-based, no database needed' },
        { value: 'strapi', label: 'Strapi', hint: 'open source, self-hosted' },
        { value: 'wordpress', label: 'WordPress (headless)', hint: 'familiar, huge ecosystem' },
        { value: 'other', label: 'Other', hint: 'tell me what you want' },
      ],
    };
  }

  // REALTIME — only if they said yes
  if (interview.realtime === 'yes') {
    const alreadyOnSupabase = recommendations.database?.recommended === 'supabase' ||
      recommendations.database?.recommended === 'powersync';

    recommendations.realtime = {
      recommended: alreadyOnSupabase ? 'supabase-realtime' : 'pusher',
      reason: alreadyOnSupabase
        ? 'You need live updates. Supabase Realtime is already in your stack — no extra service needed.'
        : 'You need live updates. Pusher is simple, reliable, and works with any backend.',
      options: [
        { value: 'supabase-realtime', label: 'Supabase Realtime', hint: alreadyOnSupabase ? 'already in your stack' : 'requires Supabase' },
        { value: 'pusher', label: 'Pusher', hint: 'simple, reliable' },
        { value: 'stream', label: 'Stream', hint: 'best for chat specifically' },
        { value: 'ably', label: 'Ably', hint: 'powerful, scalable' },
        { value: 'soketi', label: 'Soketi', hint: 'self-hosted Pusher compatible' },
        { value: 'other', label: 'Other', hint: 'tell me what you want' },
      ],
    };
  }

  // EMAIL — always shown
  recommendations.email = {
    recommended: 'resend',
    reason: 'Every app needs transactional email. Resend is the developer-first choice — clean API, React email templates.',
    options: [
      { value: 'resend', label: 'Resend', hint: 'recommended — developer first' },
      { value: 'sendgrid', label: 'SendGrid', hint: 'established, high volume' },
      { value: 'postmark', label: 'Postmark', hint: 'transactional focused' },
      { value: 'mailgun', label: 'Mailgun', hint: 'flexible, reliable' },
      { value: 'ses', label: 'AWS SES', hint: 'cheapest at scale' },
      { value: 'none', label: 'Skip for now', hint: 'add later' },
    ],
  };

  // DEPLOYMENT — always shown
  const wantsVercel = interview.constraints?.toLowerCase().includes('vercel');
  const wantsAWS = interview.constraints?.toLowerCase().includes('aws');
  const wantsRailway = interview.constraints?.toLowerCase().includes('railway');

  let deployRecommended = 'vercel';
  let deployReason = 'Vercel is the fastest path to production for most web projects — zero config, instant deploys.';

  if (wantsAWS) {
    deployRecommended = 'aws';
    deployReason = 'You mentioned AWS. Full control, infinite scale, more ops overhead.';
  } else if (wantsRailway) {
    deployRecommended = 'railway';
    deployReason = 'You mentioned Railway. Simple, affordable, great for backends and databases.';
  } else if (wantsVercel) {
    deployReason = 'You mentioned Vercel. Zero config, native framework support, instant deploys.';
  }

  recommendations.deployment = {
    recommended: deployRecommended,
    reason: deployReason,
    options: [
      { value: 'vercel', label: 'Vercel', hint: 'zero config, framework native' },
      { value: 'railway', label: 'Railway', hint: 'simple, backends + databases' },
      { value: 'fly', label: 'Fly.io', hint: 'global, containerized' },
      { value: 'render', label: 'Render', hint: 'simple, affordable' },
      { value: 'aws', label: 'AWS', hint: 'full control, more ops' },
      { value: 'gcp', label: 'Google Cloud', hint: 'GCP ecosystem' },
      { value: 'azure', label: 'Azure', hint: 'Microsoft ecosystem' },
      { value: 'cloudflare', label: 'Cloudflare Pages', hint: 'edge-first, fast' },
      { value: 'heroku', label: 'Heroku', hint: 'simple, well-known' },
      { value: 'digitalocean', label: 'DigitalOcean', hint: 'simple VPS, affordable' },
      { value: 'self', label: 'Self-hosted', hint: 'your own server' },
      { value: 'other', label: 'Other', hint: 'tell me what you want' },
    ],
  };

  return recommendations;
}