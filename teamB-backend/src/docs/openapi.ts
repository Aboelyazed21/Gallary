/**
 * OpenAPI 3.0 specification for the Team B API.
 * Served at /api/docs (non-production). Endpoints mirror the route table in app.ts.
 */
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Smart Academic Advisor — Team B Backend',
    version: '1.0.0',
    description:
      'Platform, Database & Academic Core for the AIDM Smart Academic Advisor. ' +
      'Academic rules are configurable database records — never hard-coded.',
  },
  servers: [{ url: 'http://localhost:4000' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },
      EligibilityResult: {
        type: 'object',
        properties: {
          eligible: { type: 'boolean' },
          status: { type: 'string', enum: ['ELIGIBLE', 'NOT_ELIGIBLE', 'UNKNOWN', 'REVIEW_REQUIRED'] },
          courseCode: { type: 'string' },
          reasons: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rule: { type: 'string' },
                message: { type: 'string' },
                severity: { type: 'string', enum: ['BLOCKING', 'WARNING', 'INFO'] },
              },
            },
          },
          missingPrerequisites: { type: 'array', items: { type: 'string' } },
          failedPrerequisites: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'object' } },
        },
      },
      GpaReport: {
        type: 'object',
        properties: {
          studentId: { type: 'integer' },
          gradingScale: { type: 'object' },
          retakePolicy: { type: 'string' },
          cgpa: { type: 'number', nullable: true },
          history: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                semesterId: { type: 'integer' },
                semesterCode: { type: 'string' },
                semesterName: { type: 'string' },
                gpa: { type: 'number', nullable: true },
                creditsAttempted: { type: 'integer' },
                creditsEarned: { type: 'integer' },
              },
            },
          },
        },
      },
      DegreeProgress: {
        type: 'object',
        properties: {
          studentId: { type: 'integer' },
          requiredHoursTotal: { type: 'integer' },
          completedHours: { type: 'integer' },
          remainingHours: { type: 'integer' },
          requiredCoursesTotal: { type: 'integer' },
          requiredCoursesDone: { type: 'integer' },
          graduationEligible: { type: 'boolean' },
          missingRequiredCourses: {
            type: 'array',
            items: { type: 'object', properties: { courseId: { type: 'integer' }, code: { type: 'string' } } },
          },
        },
      },
    },
  },
  paths: {
    '/api/auth/login': {
      post: {
        summary: 'Login and receive access + refresh tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: { email: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Tokens issued' }, '401': { description: 'Invalid credentials' } },
      },
    },
    '/api/auth/register': {
      post: {
        summary: 'Register a student account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'fullName', 'universityId'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                  fullName: { type: 'string' },
                  universityId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Account created' }, '400': { description: 'Validation error' } },
      },
    },
    '/api/auth/refresh': {
      post: {
        summary: 'Rotate the refresh token',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } },
        },
        responses: { '200': { description: 'New token pair' }, '401': { description: 'Invalid refresh token' } },
      },
    },
    '/api/auth/me': {
      get: { summary: 'Current principal + student profile', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Principal' } } },
    },
    '/api/students/{id}': {
      get: {
        summary: 'Get student profile (ADMIN/ADVISOR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Student' }, '404': { description: 'Not found' } },
      },
    },
    '/api/students/{id}/academic-records': {
      get: {
        summary: 'Student records + registrations',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Academic summary' } },
      },
    },
    '/api/students/{id}/gpa': {
      get: {
        summary: 'GPA report (CGPA + per-semester history)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'GPA report', content: { 'application/json': { schema: { $ref: '#/components/schemas/GpaReport' } } } } },
      },
    },
    '/api/students/{id}/progress': {
      get: {
        summary: 'Degree progress',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Degree progress', content: { 'application/json': { schema: { $ref: '#/components/schemas/DegreeProgress' } } } } },
      },
    },
    '/api/courses': {
      get: {
        summary: 'List courses',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'programId', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated courses' } },
      },
    },
    '/api/eligibility/check': {
      post: {
        summary: 'Run the academic eligibility engine for one course',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['studentId', 'courseId', 'semesterId'],
                properties: { studentId: { type: 'integer' }, courseId: { type: 'integer' }, semesterId: { type: 'integer' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Eligibility verdict', content: { 'application/json': { schema: { $ref: '#/components/schemas/EligibilityResult' } } } } },
      },
    },
    '/api/eligibility/check-bulk': {
      post: {
        summary: 'Run eligibility for many courses',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['studentId', 'courseIds', 'semesterId'],
                properties: {
                  studentId: { type: 'integer' },
                  courseIds: { type: 'array', items: { type: 'integer' }, minItems: 1 },
                  semesterId: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Array of verdicts' } },
      },
    },
    '/api/academic-rules': {
      get: {
        summary: 'List configurable academic rules (ADMIN/ADVISOR)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Rule list' } },
      },
      post: {
        summary: 'Create or update a rule (ADMIN) — versioned, configurable',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['key', 'category', 'titleEn', 'value'],
                properties: {
                  key: { type: 'string' },
                  category: { type: 'string' },
                  titleEn: { type: 'string' },
                  descriptionEn: { type: 'string' },
                  value: { type: 'object' },
                  sourceRef: { type: 'string' },
                  requiresConfirmation: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Rule stored' } },
      },
    },
    '/api/registrations': {
      post: {
        summary: 'Register the student after eligibility check',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['studentId', 'courseId', 'semesterId'],
                properties: { studentId: { type: 'integer' }, courseId: { type: 'integer' }, semesterId: { type: 'integer' } },
              },
            },
          },
        },
        responses: { '201': { description: 'Registration created' }, '400': { description: 'Not eligible' } },
      },
    },
    '/api/admin/students/import': {
      post: {
        summary: 'Controlled CSV-style student import (ADMIN)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  rows: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        email: { type: 'string' },
                        password: { type: 'string' },
                        fullName: { type: 'string' },
                        universityId: { type: 'string' },
                        programId: { type: 'integer' },
                        level: { type: 'integer', default: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Import report' } },
      },
    },
  },
};
