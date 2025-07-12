const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Docker = require('dockerode');
const k8s = require('@kubernetes/client-node');
const tar = require('tar-stream');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3004;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// File upload configuration
const upload = multer({ 
  dest: '/tmp/uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Docker and Kubernetes clients
const docker = new Docker();
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);

// Application Lifecycle Manager
class ApplicationLifecycleManager {
  constructor() {
    this.applications = new Map();
    this.deployments = new Map();
  }

  async createApplication(appConfig) {
    const appId = uuidv4();
    const application = {
      id: appId,
      name: appConfig.name,
      type: appConfig.type || 'web',
      runtime: appConfig.runtime || 'nodejs',
      status: 'created',
      createdAt: new Date(),
      updatedAt: new Date(),
      config: appConfig,
      deployments: [],
      resources: {
        cpu: appConfig.resources?.cpu || '100m',
        memory: appConfig.resources?.memory || '128Mi',
        replicas: appConfig.resources?.replicas || 1
      },
      environment: appConfig.environment || {},
      healthCheck: appConfig.healthCheck || {
        path: '/health',
        port: 3000,
        initialDelaySeconds: 30,
        periodSeconds: 10
      }
    };

    this.applications.set(appId, application);
    
    // Store in data service
    await this.storeApplicationEvent(appId, 'ApplicationCreated', application);
    
    return application;
  }

  async buildApplication(appId, sourceCode) {
    const application = this.applications.get(appId);
    if (!application) {
      throw new Error(`Application ${appId} not found`);
    }

    const buildId = uuidv4();
    const buildConfig = {
      id: buildId,
      appId,
      status: 'building',
      startedAt: new Date(),
      sourceCode,
      runtime: application.runtime
    };

    try {
      // Create Docker image
      const imageName = `aleph/${application.name}:${buildId}`;
      const dockerfile = this.generateDockerfile(application.runtime, application.config);
      
      const buildStream = await this.buildDockerImage(imageName, sourceCode, dockerfile);
      
      buildConfig.status = 'completed';
      buildConfig.completedAt = new Date();
      buildConfig.imageName = imageName;
      
      application.status = 'built';
      application.updatedAt = new Date();
      application.latestBuild = buildConfig;
      
      await this.storeApplicationEvent(appId, 'ApplicationBuilt', {
        buildId,
        imageName,
        runtime: application.runtime
      });
      
      return buildConfig;
    } catch (error) {
      buildConfig.status = 'failed';
      buildConfig.error = error.message;
      buildConfig.completedAt = new Date();
      
      throw error;
    }
  }

  async deployApplication(appId, environment = 'development') {
    const application = this.applications.get(appId);
    if (!application) {
      throw new Error(`Application ${appId} not found`);
    }

    if (!application.latestBuild || application.latestBuild.status !== 'completed') {
      throw new Error('Application must be built before deployment');
    }

    const deploymentId = uuidv4();
    const deployment = {
      id: deploymentId,
      appId,
      environment,
      status: 'deploying',
      startedAt: new Date(),
      imageName: application.latestBuild.imageName,
      resources: application.resources,
      replicas: application.resources.replicas
    };

    try {
      // Deploy to Kubernetes
      await this.deployToKubernetes(application, deployment);
      
      deployment.status = 'deployed';
      deployment.completedAt = new Date();
      deployment.url = `https://${application.name}-${environment}.aleph.local`;
      
      application.deployments.push(deployment);
      application.status = 'deployed';
      application.updatedAt = new Date();
      
      this.deployments.set(deploymentId, deployment);
      
      await this.storeApplicationEvent(appId, 'ApplicationDeployed', {
        deploymentId,
        environment,
        url: deployment.url,
        replicas: deployment.replicas
      });
      
      return deployment;
    } catch (error) {
      deployment.status = 'failed';
      deployment.error = error.message;
      deployment.completedAt = new Date();
      
      throw error;
    }
  }

  async scaleApplication(appId, replicas) {
    const application = this.applications.get(appId);
    if (!application) {
      throw new Error(`Application ${appId} not found`);
    }

    try {
      // Scale Kubernetes deployment
      await this.scaleKubernetesDeployment(application.name, replicas);
      
      application.resources.replicas = replicas;
      application.updatedAt = new Date();
      
      await this.storeApplicationEvent(appId, 'ApplicationScaled', {
        previousReplicas: application.resources.replicas,
        newReplicas: replicas
      });
      
      return { appId, replicas, status: 'scaled' };
    } catch (error) {
      throw new Error(`Failed to scale application: ${error.message}`);
    }
  }

  async getApplicationLogs(appId, lines = 100) {
    const application = this.applications.get(appId);
    if (!application) {
      throw new Error(`Application ${appId} not found`);
    }

    try {
      // Get logs from Kubernetes
      const logs = await this.getKubernetesLogs(application.name, lines);
      return logs;
    } catch (error) {
      throw new Error(`Failed to get logs: ${error.message}`);
    }
  }

  async getApplicationMetrics(appId) {
    const application = this.applications.get(appId);
    if (!application) {
      throw new Error(`Application ${appId} not found`);
    }

    // Mock metrics (in production, integrate with Prometheus)
    return {
      appId,
      metrics: {
        cpu: Math.random() * 100,
        memory: Math.random() * 512,
        requests: Math.floor(Math.random() * 1000),
        errors: Math.floor(Math.random() * 10),
        responseTime: Math.random() * 200 + 50
      },
      timestamp: new Date()
    };
  }

  // Private methods
  generateDockerfile(runtime, config) {
    const dockerfiles = {
      nodejs: `
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE ${config.port || 3000}
CMD ["npm", "start"]
      `,
      python: `
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE ${config.port || 8000}
CMD ["python", "app.py"]
      `,
      java: `
FROM openjdk:11-jre-slim
WORKDIR /app
COPY target/*.jar app.jar
EXPOSE ${config.port || 8080}
CMD ["java", "-jar", "app.jar"]
      `
    };

    return dockerfiles[runtime] || dockerfiles.nodejs;
  }

  async buildDockerImage(imageName, sourceCode, dockerfile) {
    // Create tar stream with source code and Dockerfile
    const pack = tar.pack();
    
    // Add Dockerfile
    pack.entry({ name: 'Dockerfile' }, dockerfile);
    
    // Add source code files
    for (const [filename, content] of Object.entries(sourceCode)) {
      pack.entry({ name: filename }, content);
    }
    
    pack.finalize();
    
    // Build Docker image
    const stream = await docker.buildImage(pack, { t: imageName });
    
    return new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }

  async deployToKubernetes(application, deployment) {
    const namespace = 'aleph-paas';
    
    // Create deployment manifest
    const deploymentManifest = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: application.name,
        namespace,
        labels: {
          app: application.name,
          'aleph.ai/app-id': application.id
        }
      },
      spec: {
        replicas: deployment.replicas,
        selector: {
          matchLabels: {
            app: application.name
          }
        },
        template: {
          metadata: {
            labels: {
              app: application.name
            }
          },
          spec: {
            containers: [{
              name: application.name,
              image: deployment.imageName,
              ports: [{
                containerPort: application.config.port || 3000
              }],
              env: Object.entries(application.environment).map(([key, value]) => ({
                name: key,
                value: value
              })),
              resources: {
                requests: {
                  cpu: application.resources.cpu,
                  memory: application.resources.memory
                },
                limits: {
                  cpu: application.resources.cpu,
                  memory: application.resources.memory
                }
              },
              livenessProbe: {
                httpGet: {
                  path: application.healthCheck.path,
                  port: application.healthCheck.port
                },
                initialDelaySeconds: application.healthCheck.initialDelaySeconds,
                periodSeconds: application.healthCheck.periodSeconds
              }
            }]
          }
        }
      }
    };

    // Create service manifest
    const serviceManifest = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: application.name,
        namespace,
        labels: {
          app: application.name
        }
      },
      spec: {
        selector: {
          app: application.name
        },
        ports: [{
          port: 80,
          targetPort: application.config.port || 3000
        }],
        type: 'ClusterIP'
      }
    };

    // Deploy to Kubernetes
    try {
      await k8sApi.createNamespacedDeployment(namespace, deploymentManifest);
      await k8sCoreApi.createNamespacedService(namespace, serviceManifest);
    } catch (error) {
      if (error.response?.statusCode === 409) {
        // Update existing deployment
        await k8sApi.replaceNamespacedDeployment(application.name, namespace, deploymentManifest);
      } else {
        throw error;
      }
    }
  }

  async scaleKubernetesDeployment(appName, replicas) {
    const namespace = 'aleph-paas';
    
    // Get current deployment
    const deployment = await k8sApi.readNamespacedDeployment(appName, namespace);
    
    // Update replicas
    deployment.body.spec.replicas = replicas;
    
    // Apply update
    await k8sApi.replaceNamespacedDeployment(appName, namespace, deployment.body);
  }

  async getKubernetesLogs(appName, lines) {
    const namespace = 'aleph-paas';
    
    try {
      const logs = await k8sCoreApi.readNamespacedPodLog(
        appName, // This would need to be the actual pod name
        namespace,
        undefined, // container
        false, // follow
        undefined, // limitBytes
        undefined, // pretty
        undefined, // previous
        undefined, // sinceSeconds
        lines // tailLines
      );
      
      return logs.body;
    } catch (error) {
      return `Error retrieving logs: ${error.message}`;
    }
  }

  async storeApplicationEvent(appId, eventType, eventData) {
    // Store event in data service
    try {
      // This would call the data service API
      console.log(`Storing event: ${eventType} for app ${appId}`);
    } catch (error) {
      console.error('Failed to store application event:', error);
    }
  }

  getApplication(appId) {
    return this.applications.get(appId);
  }

  getAllApplications() {
    return Array.from(this.applications.values());
  }

  getDeployment(deploymentId) {
    return this.deployments.get(deploymentId);
  }
}

// Initialize application lifecycle manager
const appManager = new ApplicationLifecycleManager();

// API Routes

// Create new application
app.post('/applications', async (req, res) => {
  try {
    const application = await appManager.createApplication(req.body);
    res.status(201).json(application);
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all applications
app.get('/applications', (req, res) => {
  try {
    const applications = appManager.getAllApplications();
    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific application
app.get('/applications/:appId', (req, res) => {
  try {
    const application = appManager.getApplication(req.params.appId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Build application
app.post('/applications/:appId/build', upload.single('source'), async (req, res) => {
  try {
    const { appId } = req.params;
    
    // Extract source code from uploaded file or request body
    const sourceCode = req.body.sourceCode || {
      'package.json': req.body.packageJson || '{"name": "app", "version": "1.0.0", "main": "index.js"}',
      'index.js': req.body.indexJs || 'console.log("Hello World");'
    };
    
    const buildResult = await appManager.buildApplication(appId, sourceCode);
    res.json(buildResult);
  } catch (error) {
    console.error('Error building application:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deploy application
app.post('/applications/:appId/deploy', async (req, res) => {
  try {
    const { appId } = req.params;
    const { environment } = req.body;
    
    const deployment = await appManager.deployApplication(appId, environment);
    res.json(deployment);
  } catch (error) {
    console.error('Error deploying application:', error);
    res.status(500).json({ error: error.message });
  }
});

// Scale application
app.post('/applications/:appId/scale', async (req, res) => {
  try {
    const { appId } = req.params;
    const { replicas } = req.body;
    
    const result = await appManager.scaleApplication(appId, replicas);
    res.json(result);
  } catch (error) {
    console.error('Error scaling application:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get application logs
app.get('/applications/:appId/logs', async (req, res) => {
  try {
    const { appId } = req.params;
    const { lines } = req.query;
    
    const logs = await appManager.getApplicationLogs(appId, parseInt(lines) || 100);
    res.json({ logs });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get application metrics
app.get('/applications/:appId/metrics', async (req, res) => {
  try {
    const { appId } = req.params;
    const metrics = await appManager.getApplicationMetrics(appId);
    res.json(metrics);
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'aleph-paas-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    applications: appManager.getAllApplications().length
  });
});

app.listen(PORT, () => {
  console.log(`🏗️ Aleph PaaS Service running on port ${PORT}`);
});

module.exports = app;
