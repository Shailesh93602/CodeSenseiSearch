// Pinned import path — see prisma/schema.prisma generator block for why.
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

/**
 * Phase 2 Database Seed Script
 * 
 * This script initializes the database with:
 * 1. Default content sources (GitHub, StackOverflow)
 * 2. Sample development data for testing
 * 3. Initial configuration values
 */
async function main() {
  console.log('🌱 Starting Phase 2 database seeding...');

  // Clean up existing data (development only)
  console.log('🧹 Cleaning up existing data...');
  await prisma.ingestionJob.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.contentChunk.deleteMany();
  await prisma.content.deleteMany();
  await prisma.question.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.source.deleteMany();

  // Create content sources
  console.log('📊 Creating content sources...');
  const githubSource = await prisma.source.create({
    data: {
      name: 'github',
      displayName: 'GitHub',
      type: 'GITHUB',
      baseUrl: 'https://api.github.com',
      isActive: true,
      rateLimit: 5000, // 5000 requests per hour
      rateLimitWindow: 3600, // 1 hour in seconds
      config: {
        apiVersion: '2022-11-28',
        userAgent: 'CodeSenseiSearch/1.0',
        maxFileSize: 1048576, // 1MB
        supportedLanguages: [
          'javascript',
          'typescript',
          'python',
          'java',
          'go',
          'rust',
          'cpp',
          'c',
          'csharp',
          'php',
          'ruby',
          'swift',
          'kotlin',
        ],
      },
    },
  });

  const stackoverflowSource = await prisma.source.create({
    data: {
      name: 'stackoverflow',
      displayName: 'Stack Overflow',
      type: 'STACKOVERFLOW',
      baseUrl: 'https://api.stackexchange.com',
      isActive: true,
      rateLimit: 300, // 300 requests per day
      rateLimitWindow: 86400, // 24 hours in seconds
      config: {
        site: 'stackoverflow',
        apiVersion: '2.3',
        minScore: 5, // Minimum question/answer score
        minAnswers: 1, // Minimum number of answers
        preferAccepted: true,
        tags: [
          'javascript',
          'typescript',
          'python',
          'java',
          'node.js',
          'react',
          'angular',
          'vue.js',
          'express',
          'nestjs',
          'django',
          'flask',
          'spring',
          'golang',
          'rust',
        ],
      },
    },
  });

  // Create sample repositories for development
  console.log('📚 Creating sample repositories...');
  const repositories = await Promise.all([
    prisma.repository.create({
      data: {
        sourceId: githubSource.id,
        githubId: 1,
        fullName: 'microsoft/vscode',
        name: 'vscode',
        owner: 'microsoft',
        description: 'Visual Studio Code - Open Source (Code - OSS)',
        starCount: 162000,
        forkCount: 28500,
        language: 'typescript',
        size: 450000,
        htmlUrl: 'https://github.com/microsoft/vscode',
        cloneUrl: 'https://github.com/microsoft/vscode.git',
        defaultBranch: 'main',
        ingestionStatus: 'PENDING',
      },
    }),
    prisma.repository.create({
      data: {
        sourceId: githubSource.id,
        githubId: 2,
        fullName: 'facebook/react',
        name: 'react',
        owner: 'facebook',
        description: 'The library for web and native user interfaces.',
        starCount: 227000,
        forkCount: 46300,
        language: 'javascript',
        size: 89000,
        htmlUrl: 'https://github.com/facebook/react',
        cloneUrl: 'https://github.com/facebook/react.git',
        defaultBranch: 'main',
        ingestionStatus: 'PENDING',
      },
    }),
    prisma.repository.create({
      data: {
        sourceId: githubSource.id,
        githubId: 3,
        fullName: 'nestjs/nest',
        name: 'nest',
        owner: 'nestjs',
        description: 'A progressive Node.js framework for building efficient, scalable server-side applications.',
        starCount: 67000,
        forkCount: 7700,
        language: 'typescript',
        size: 12000,
        htmlUrl: 'https://github.com/nestjs/nest',
        cloneUrl: 'https://github.com/nestjs/nest.git',
        defaultBranch: 'master',
        ingestionStatus: 'PENDING',
      },
    }),
  ]);

  // Create sample StackOverflow questions for development
  console.log('❓ Creating sample StackOverflow questions...');
  const questions = await Promise.all([
    prisma.question.create({
      data: {
        sourceId: stackoverflowSource.id,
        questionId: 1,
        title: 'How to use async/await in JavaScript?',
        body: '<p>I am trying to understand how async/await works in JavaScript. Can someone explain with examples?</p>',
        tags: ['javascript', 'async-await', 'promises'],
        score: 125,
        viewCount: 50000,
        answerCount: 8,
        isAnswered: true,
        hasAcceptedAnswer: true,
        htmlUrl: 'https://stackoverflow.com/questions/1',
        ingestionStatus: 'PENDING',
      },
    }),
    prisma.question.create({
      data: {
        sourceId: stackoverflowSource.id,
        questionId: 2,
        title: 'What is the difference between React hooks and class components?',
        body: '<p>I am new to React and want to understand when to use hooks vs class components. What are the main differences?</p>',
        tags: ['reactjs', 'react-hooks', 'react-class-components'],
        score: 89,
        viewCount: 25000,
        answerCount: 12,
        isAnswered: true,
        hasAcceptedAnswer: true,
        htmlUrl: 'https://stackoverflow.com/questions/2',
        ingestionStatus: 'PENDING',
      },
    }),
    prisma.question.create({
      data: {
        sourceId: stackoverflowSource.id,
        questionId: 3,
        title: 'How to implement dependency injection in NestJS?',
        body: '<p>I am building a NestJS application and want to understand how dependency injection works. Can someone provide examples?</p>',
        tags: ['nestjs', 'dependency-injection', 'typescript'],
        score: 67,
        viewCount: 15000,
        answerCount: 6,
        isAnswered: true,
        hasAcceptedAnswer: true,
        htmlUrl: 'https://stackoverflow.com/questions/3',
        ingestionStatus: 'PENDING',
      },
    }),
  ]);

  // Create initial ingestion jobs for development testing
  console.log('🔄 Creating initial ingestion jobs...');
  const ingestionJobs = await Promise.all([
    prisma.ingestionJob.create({
      data: {
        jobType: 'GITHUB_DISCOVER_REPOSITORIES',
        status: 'PENDING',
        priority: 8,
        sourceId: githubSource.id,
        jobData: {
          language: 'typescript',
          minStars: 1000,
          maxResults: 50,
          query: 'framework OR library',
        },
        config: {
          batchSize: 10,
          delayBetweenRequests: 1000,
        },
      },
    }),
    prisma.ingestionJob.create({
      data: {
        jobType: 'STACKOVERFLOW_DISCOVER_QUESTIONS',
        status: 'PENDING',
        priority: 7,
        sourceId: stackoverflowSource.id,
        jobData: {
          tags: ['javascript', 'typescript'],
          minScore: 10,
          maxResults: 100,
        },
        config: {
          batchSize: 25,
          delayBetweenRequests: 2000,
        },
      },
    }),
    prisma.ingestionJob.create({
      data: {
        jobType: 'GITHUB_INGEST_REPOSITORY',
        status: 'PENDING',
        priority: 6,
        sourceId: githubSource.id,
        repositoryId: repositories[0].id,
        jobData: {
          owner: 'microsoft',
          name: 'vscode',
          fullName: 'microsoft/vscode',
          priority: 8,
        },
        config: {
          maxFileSize: 1048576,
          supportedExtensions: ['.ts', '.js', '.md', '.json'],
          excludePaths: ['node_modules', '.git', 'dist', 'build'],
        },
      },
    }),
  ]);

  console.log('✅ Database seeding completed successfully!');
  console.log(`Created:`);
  console.log(`  - ${2} content sources (GitHub, StackOverflow)`);
  console.log(`  - ${repositories.length} sample repositories`);
  console.log(`  - ${questions.length} sample questions`);
  console.log(`  - ${ingestionJobs.length} initial ingestion jobs`);
  console.log('');
  console.log('🚀 Database is ready for Phase 2 development!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Start the application: npm run start:dev');
  console.log('2. Check ingestion jobs: Check the admin panel or API');
  console.log('3. Run workers to process jobs');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seeding:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });