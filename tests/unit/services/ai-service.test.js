// Unit Tests for AI Service
// Testing AI model management, agent orchestration, and quantum integration

const request = require('supertest');
const app = require('../../../services/ai-service/src/index');

describe('AI Service', () => {
  describe('GET /models', () => {
    it('should return list of available AI models', async () => {
      const response = await request(app).get('/models');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Check model structure
      const model = response.body[0];
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('type');
      expect(model).toHaveProperty('status');
      expect(model).toHaveProperty('capabilities');
    });

    it('should include quantum and causal AI models', async () => {
      const response = await request(app).get('/models');
      
      const modelTypes = response.body.map(m => m.type);
      expect(modelTypes).toContain('llm');
      expect(modelTypes).toContain('quantum-ml');
      expect(modelTypes).toContain('causal-ai');
    });
  });

  describe('POST /inference/:modelId', () => {
    it('should perform LLM inference', async () => {
      const response = await request(app)
        .post('/inference/llama2-7b')
        .send({
          input: { prompt: 'What is artificial intelligence?' },
          parameters: { temperature: 0.7, max_tokens: 100 }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('inferenceId');
      expect(response.body).toHaveProperty('modelId');
      expect(response.body).toHaveProperty('result');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body.metadata).toHaveProperty('executionTime');
    });

    it('should perform quantum ML optimization', async () => {
      const response = await request(app)
        .post('/inference/quantum-optimizer')
        .send({
          input: { variables: 5, constraints: ['x1 + x2 <= 10'] },
          parameters: { quantum_backend: 'simulator', shots: 1024 }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toHaveProperty('optimization_result');
      expect(response.body.result.optimization_result).toHaveProperty('optimal_solution');
      expect(response.body.result.optimization_result).toHaveProperty('cost_reduction');
    });

    it('should perform causal AI analysis', async () => {
      const response = await request(app)
        .post('/inference/causal-analyzer')
        .send({
          input: { 
            data: [[1, 2, 3], [4, 5, 6]], 
            variables: ['A', 'B', 'C'] 
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toHaveProperty('causal_relationships');
      expect(response.body.result).toHaveProperty('interventions');
      expect(response.body.result).toHaveProperty('confidence');
    });

    it('should handle invalid model ID', async () => {
      const response = await request(app)
        .post('/inference/invalid-model')
        .send({ input: { prompt: 'test' } });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('AI Agent Management', () => {
    it('should return list of AI agents', async () => {
      const response = await request(app).get('/agents');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      const agentTypes = response.body.map(a => a.id);
      expect(agentTypes).toContain('security-agent');
      expect(agentTypes).toContain('optimization-agent');
      expect(agentTypes).toContain('compliance-agent');
    });

    it('should assign task to agent', async () => {
      const response = await request(app)
        .post('/agents/security-agent/tasks')
        .send({
          type: 'threat-detection',
          data: { target: 'system-scan' },
          priority: 'high'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('taskId');
      expect(response.body.status).toBe('assigned');
    });

    it('should get task status', async () => {
      // First assign a task
      const assignResponse = await request(app)
        .post('/agents/optimization-agent/tasks')
        .send({
          type: 'performance-optimization',
          data: { target: 'cpu-usage' }
        });

      const taskId = assignResponse.body.taskId;

      // Then get task status
      const response = await request(app).get(`/tasks/${taskId}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status');
      expect(['assigned', 'executing', 'completed'].includes(response.body.status)).toBe(true);
    });
  });

  describe('Batch Inference', () => {
    it('should handle multiple inference requests', async () => {
      const response = await request(app)
        .post('/inference/batch')
        .send({
          requests: [
            {
              modelId: 'llama2-7b',
              input: { prompt: 'Hello world' },
              parameters: { temperature: 0.5 }
            },
            {
              modelId: 'quantum-optimizer',
              input: { variables: 3 },
              parameters: { shots: 512 }
            }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(response.body.results.length).toBe(2);
    });
  });

  describe('Health Check', () => {
    it('should return service health with model and agent counts', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('aleph-ai-service');
      expect(response.body).toHaveProperty('models');
      expect(response.body).toHaveProperty('agents');
      expect(typeof response.body.models).toBe('number');
      expect(typeof response.body.agents).toBe('number');
    });
  });
});
