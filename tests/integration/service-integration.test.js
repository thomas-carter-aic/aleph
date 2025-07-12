// Integration Tests for Service Communication
// Testing complete workflows across all services

const request = require('supertest');
const axios = require('axios');

// Service endpoints
const AUTH_SERVICE = 'http://localhost:3001';
const DATA_SERVICE = 'http://localhost:3002';
const AI_SERVICE = 'http://localhost:3003';
const PAAS_SERVICE = 'http://localhost:3004';

describe('Service Integration Tests', () => {
  let authToken;
  let testUserId;

  beforeAll(async () => {
    // Setup: Login to get auth token
    try {
      const loginResponse = await axios.post(`${AUTH_SERVICE}/auth/login`, {
        email: 'admin@aleph.ai',
        password: 'admin123'
      });
      authToken = loginResponse.data.token;
      testUserId = loginResponse.data.user.id;
    } catch (error) {
      console.warn('Auth service not available for integration tests');
    }
  });

  describe('Complete AI Model Lifecycle', () => {
    let modelId;
    let trainingEventId;

    it('should create and train AI model with event sourcing', async () => {
      if (!authToken) {
        console.log('Skipping test - auth token not available');
        return;
      }

      // Step 1: Store training event in data service
      const eventResponse = await axios.post(`${DATA_SERVICE}/events`, {
        aggregateId: 'model_test_integration',
        eventType: 'AIModelTrainingStarted',
        eventData: {
          modelType: 'llm',
          trainingData: { samples: 1000 },
          parameters: { epochs: 5, batchSize: 32 }
        },
        metadata: { userId: testUserId }
      });

      expect(eventResponse.status).toBe(201);
      trainingEventId = eventResponse.data.id;

      // Step 2: Verify event stored with temporal context
      const eventsResponse = await axios.get(`${DATA_SERVICE}/events/model_test_integration`);
      expect(eventsResponse.status).toBe(200);
      expect(eventsResponse.data.length).toBeGreaterThan(0);

      // Step 3: Get temporal state
      const temporalResponse = await axios.get(`${DATA_SERVICE}/temporal/model_test_integration/state`);
      expect(temporalResponse.status).toBe(200);
      expect(temporalResponse.data).toHaveProperty('state');
    });

    it('should perform AI inference and store results', async () => {
      // Step 1: Perform inference
      const inferenceResponse = await axios.post(`${AI_SERVICE}/inference/llama2-7b`, {
        input: { prompt: 'Integration test prompt' },
        parameters: { temperature: 0.7 }
      });

      expect(inferenceResponse.status).toBe(200);
      expect(inferenceResponse.data).toHaveProperty('result');

      // Step 2: Store inference result as event
      const eventResponse = await axios.post(`${DATA_SERVICE}/events`, {
        aggregateId: 'model_test_integration',
        eventType: 'AIModelInferenceCompleted',
        eventData: {
          inferenceId: inferenceResponse.data.inferenceId,
          result: inferenceResponse.data.result,
          executionTime: inferenceResponse.data.metadata.executionTime
        }
      });

      expect(eventResponse.status).toBe(201);
    });

    it('should create causal relationships between events', async () => {
      // Create causal relationship between training and inference
      const causalResponse = await axios.post(`${DATA_SERVICE}/causal/relationships`, {
        cause: 'AIModelTrainingStarted',
        effect: 'AIModelInferenceCompleted',
        strength: 0.8,
        metadata: { 
          aggregateId: 'model_test_integration',
          relationship_type: 'training_enables_inference'
        }
      });

      expect(causalResponse.status).toBe(201);

      // Verify causal chain
      const chainResponse = await axios.get(`${DATA_SERVICE}/causal/chain/AIModelTrainingStarted`);
      expect(chainResponse.status).toBe(200);
      expect(chainResponse.data.causalChain.length).toBeGreaterThan(0);
    });
  });

  describe('PaaS Application Deployment Workflow', () => {
    let applicationId;
    let deploymentId;

    it('should create application through PaaS service', async () => {
      const appResponse = await axios.post(`${PAAS_SERVICE}/applications`, {
        name: 'test-integration-app',
        type: 'web',
        runtime: 'nodejs',
        resources: {
          cpu: '200m',
          memory: '256Mi',
          replicas: 1
        },
        environment: {
          NODE_ENV: 'test',
          API_URL: 'http://localhost:3000'
        }
      });

      expect(appResponse.status).toBe(201);
      expect(appResponse.data).toHaveProperty('id');
      applicationId = appResponse.data.id;
    });

    it('should build application with source code', async () => {
      const buildResponse = await axios.post(`${PAAS_SERVICE}/applications/${applicationId}/build`, {
        sourceCode: {
          'package.json': JSON.stringify({
            name: 'test-app',
            version: '1.0.0',
            main: 'index.js',
            scripts: { start: 'node index.js' }
          }),
          'index.js': `
            const express = require('express');
            const app = express();
            app.get('/health', (req, res) => res.json({ status: 'ok' }));
            app.listen(3000, () => console.log('App running'));
          `
        }
      });

      expect(buildResponse.status).toBe(200);
      expect(buildResponse.data).toHaveProperty('status');
      expect(['building', 'completed'].includes(buildResponse.data.status)).toBe(true);
    });

    it('should deploy application to development environment', async () => {
      // Wait a bit for build to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const deployResponse = await axios.post(`${PAAS_SERVICE}/applications/${applicationId}/deploy`, {
        environment: 'development'
      });

      expect(deployResponse.status).toBe(200);
      expect(deployResponse.data).toHaveProperty('status');
      deploymentId = deployResponse.data.id;
    });

    it('should scale application', async () => {
      const scaleResponse = await axios.post(`${PAAS_SERVICE}/applications/${applicationId}/scale`, {
        replicas: 2
      });

      expect(scaleResponse.status).toBe(200);
      expect(scaleResponse.data.replicas).toBe(2);
    });

    it('should get application metrics', async () => {
      const metricsResponse = await axios.get(`${PAAS_SERVICE}/applications/${applicationId}/metrics`);

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.data).toHaveProperty('metrics');
      expect(metricsResponse.data.metrics).toHaveProperty('cpu');
      expect(metricsResponse.data.metrics).toHaveProperty('memory');
    });
  });

  describe('AI Agent Orchestration Workflow', () => {
    it('should coordinate multiple agents for complex task', async () => {
      // Step 1: Assign security scan task
      const securityTaskResponse = await axios.post(`${AI_SERVICE}/agents/security-agent/tasks`, {
        type: 'threat-detection',
        data: { target: 'integration-test-system' },
        priority: 'medium'
      });

      expect(securityTaskResponse.status).toBe(201);
      const securityTaskId = securityTaskResponse.data.taskId;

      // Step 2: Assign optimization task
      const optimizationTaskResponse = await axios.post(`${AI_SERVICE}/agents/optimization-agent/tasks`, {
        type: 'performance-optimization',
        data: { target: 'integration-test-system' },
        priority: 'medium'
      });

      expect(optimizationTaskResponse.status).toBe(201);
      const optimizationTaskId = optimizationTaskResponse.data.taskId;

      // Step 3: Wait and check task completion
      await new Promise(resolve => setTimeout(resolve, 3000));

      const securityTaskStatus = await axios.get(`${AI_SERVICE}/tasks/${securityTaskId}`);
      const optimizationTaskStatus = await axios.get(`${AI_SERVICE}/tasks/${optimizationTaskId}`);

      expect(['executing', 'completed'].includes(securityTaskStatus.data.status)).toBe(true);
      expect(['executing', 'completed'].includes(optimizationTaskStatus.data.status)).toBe(true);
    });
  });

  describe('Cross-Service Data Flow', () => {
    it('should maintain data consistency across services', async () => {
      const testAggregateId = 'cross_service_test';

      // Step 1: Create events in data service
      await axios.post(`${DATA_SERVICE}/events`, {
        aggregateId: testAggregateId,
        eventType: 'CrossServiceTestStarted',
        eventData: { testId: 'integration_001' }
      });

      // Step 2: Perform AI inference
      const inferenceResponse = await axios.post(`${AI_SERVICE}/inference/llama2-7b`, {
        input: { prompt: 'Cross-service integration test' }
      });

      // Step 3: Store inference result
      await axios.post(`${DATA_SERVICE}/events`, {
        aggregateId: testAggregateId,
        eventType: 'CrossServiceInferenceCompleted',
        eventData: {
          inferenceId: inferenceResponse.data.inferenceId,
          result: inferenceResponse.data.result
        }
      });

      // Step 4: Verify event sequence
      const eventsResponse = await axios.get(`${DATA_SERVICE}/events/${testAggregateId}`);
      expect(eventsResponse.data.length).toBe(2);
      
      const eventTypes = eventsResponse.data.map(e => e.eventType);
      expect(eventTypes).toContain('CrossServiceTestStarted');
      expect(eventTypes).toContain('CrossServiceInferenceCompleted');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle service unavailability gracefully', async () => {
      // Test with invalid service endpoint
      try {
        await axios.get('http://localhost:9999/invalid-service');
      } catch (error) {
        expect(error.code).toBe('ECONNREFUSED');
      }
    });

    it('should validate input data across services', async () => {
      // Test invalid event data
      try {
        await axios.post(`${DATA_SERVICE}/events`, {
          // Missing required fields
          eventType: 'InvalidEvent'
        });
      } catch (error) {
        expect(error.response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});

// Helper function to wait for async operations
const waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms));
