const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const Redis = require('redis');
const { Kafka } = require('kafkajs');

const app = express();
const PORT = process.env.PORT || 3002;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Database connections
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'aleph',
  user: process.env.POSTGRES_USER || 'aleph',
  password: process.env.POSTGRES_PASSWORD || 'aleph123',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const redis = Redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

const kafka = Kafka({
  clientId: 'aleph-data-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});

// Event Store Implementation
class EventStore {
  constructor() {
    this.producer = kafka.producer();
    this.consumer = kafka.consumer({ groupId: 'data-service-group' });
  }

  async initialize() {
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'aleph-events' });
  }

  async storeEvent(aggregateId, eventType, eventData, metadata = {}) {
    const event = {
      id: uuidv4(),
      aggregateId,
      eventType,
      eventData,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        version: 1
      }
    };

    // Store in PostgreSQL for persistence
    const query = `
      INSERT INTO events (id, aggregate_id, event_type, event_data, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await pgPool.query(query, [
      event.id,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.eventData),
      JSON.stringify(event.metadata),
      new Date()
    ]);

    // Publish to Kafka for real-time processing
    await this.producer.send({
      topic: 'aleph-events',
      messages: [{
        key: event.aggregateId,
        value: JSON.stringify(event)
      }]
    });

    // Cache recent events in Redis
    await redis.lpush(`events:${aggregateId}`, JSON.stringify(event));
    await redis.ltrim(`events:${aggregateId}`, 0, 99); // Keep last 100 events

    return event;
  }

  async getEvents(aggregateId, fromVersion = 0) {
    const query = `
      SELECT * FROM events 
      WHERE aggregate_id = $1 AND version >= $2 
      ORDER BY created_at ASC
    `;
    
    const result = await pgPool.query(query, [aggregateId, fromVersion]);
    return result.rows.map(row => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      eventData: JSON.parse(row.event_data),
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at
    }));
  }

  async getEventsByTimeRange(startTime, endTime) {
    const query = `
      SELECT * FROM events 
      WHERE created_at BETWEEN $1 AND $2 
      ORDER BY created_at ASC
    `;
    
    const result = await pgPool.query(query, [startTime, endTime]);
    return result.rows;
  }
}

// Temporal Query Engine
class TemporalQueryEngine {
  constructor(eventStore) {
    this.eventStore = eventStore;
  }

  async getStateAtTime(aggregateId, timestamp) {
    const events = await this.eventStore.getEvents(aggregateId);
    const relevantEvents = events.filter(e => 
      new Date(e.createdAt) <= new Date(timestamp)
    );
    
    return this.reconstructState(relevantEvents);
  }

  async getHistoricalStates(aggregateId, timeRange) {
    const events = await this.eventStore.getEventsByTimeRange(
      timeRange.start, 
      timeRange.end
    );
    
    const snapshots = [];
    let currentState = {};
    
    for (const event of events) {
      currentState = this.applyEvent(currentState, event);
      snapshots.push({
        timestamp: event.createdAt,
        state: { ...currentState }
      });
    }
    
    return snapshots;
  }

  reconstructState(events) {
    return events.reduce((state, event) => {
      return this.applyEvent(state, event);
    }, {});
  }

  applyEvent(state, event) {
    // Event application logic based on event type
    switch (event.eventType) {
      case 'AIModelCreated':
        return { ...state, ...event.eventData, status: 'created' };
      case 'AIModelTrained':
        return { ...state, ...event.eventData, status: 'trained' };
      case 'AIModelDeployed':
        return { ...state, ...event.eventData, status: 'deployed' };
      default:
        return state;
    }
  }
}

// Causal Graph Database
class CausalGraphDB {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }

  async addCausalRelationship(cause, effect, strength, metadata = {}) {
    const relationshipId = uuidv4();
    const relationship = {
      id: relationshipId,
      cause,
      effect,
      strength,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString()
      }
    };

    // Store in PostgreSQL
    const query = `
      INSERT INTO causal_relationships (id, cause_event, effect_event, strength, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `;
    
    await pgPool.query(query, [
      relationshipId,
      cause,
      effect,
      strength,
      JSON.stringify(relationship.metadata)
    ]);

    return relationship;
  }

  async getCausalChain(eventId) {
    const query = `
      WITH RECURSIVE causal_chain AS (
        SELECT id, cause_event, effect_event, strength, 1 as depth
        FROM causal_relationships
        WHERE cause_event = $1
        
        UNION ALL
        
        SELECT cr.id, cr.cause_event, cr.effect_event, cr.strength, cc.depth + 1
        FROM causal_relationships cr
        JOIN causal_chain cc ON cr.cause_event = cc.effect_event
        WHERE cc.depth < 10
      )
      SELECT * FROM causal_chain ORDER BY depth;
    `;
    
    const result = await pgPool.query(query, [eventId]);
    return result.rows;
  }
}

// Initialize services
const eventStore = new EventStore();
const temporalEngine = new TemporalQueryEngine(eventStore);
const causalGraph = new CausalGraphDB();

// API Routes
app.post('/events', async (req, res) => {
  try {
    const { aggregateId, eventType, eventData, metadata } = req.body;
    const event = await eventStore.storeEvent(aggregateId, eventType, eventData, metadata);
    res.status(201).json(event);
  } catch (error) {
    console.error('Error storing event:', error);
    res.status(500).json({ error: 'Failed to store event' });
  }
});

app.get('/events/:aggregateId', async (req, res) => {
  try {
    const { aggregateId } = req.params;
    const { fromVersion = 0 } = req.query;
    const events = await eventStore.getEvents(aggregateId, parseInt(fromVersion));
    res.json(events);
  } catch (error) {
    console.error('Error retrieving events:', error);
    res.status(500).json({ error: 'Failed to retrieve events' });
  }
});

app.get('/temporal/:aggregateId/state', async (req, res) => {
  try {
    const { aggregateId } = req.params;
    const { timestamp } = req.query;
    
    if (timestamp) {
      const state = await temporalEngine.getStateAtTime(aggregateId, timestamp);
      res.json({ aggregateId, timestamp, state });
    } else {
      const events = await eventStore.getEvents(aggregateId);
      const currentState = temporalEngine.reconstructState(events);
      res.json({ aggregateId, state: currentState });
    }
  } catch (error) {
    console.error('Error retrieving temporal state:', error);
    res.status(500).json({ error: 'Failed to retrieve temporal state' });
  }
});

app.get('/temporal/:aggregateId/history', async (req, res) => {
  try {
    const { aggregateId } = req.params;
    const { startTime, endTime } = req.query;
    
    const timeRange = {
      start: startTime || new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      end: endTime || new Date()
    };
    
    const history = await temporalEngine.getHistoricalStates(aggregateId, timeRange);
    res.json({ aggregateId, timeRange, history });
  } catch (error) {
    console.error('Error retrieving temporal history:', error);
    res.status(500).json({ error: 'Failed to retrieve temporal history' });
  }
});

app.post('/causal/relationships', async (req, res) => {
  try {
    const { cause, effect, strength, metadata } = req.body;
    const relationship = await causalGraph.addCausalRelationship(cause, effect, strength, metadata);
    res.status(201).json(relationship);
  } catch (error) {
    console.error('Error adding causal relationship:', error);
    res.status(500).json({ error: 'Failed to add causal relationship' });
  }
});

app.get('/causal/chain/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const chain = await causalGraph.getCausalChain(eventId);
    res.json({ eventId, causalChain: chain });
  } catch (error) {
    console.error('Error retrieving causal chain:', error);
    res.status(500).json({ error: 'Failed to retrieve causal chain' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'aleph-data-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Initialize and start server
async function startServer() {
  try {
    await eventStore.initialize();
    console.log('✅ Event store initialized');
    
    app.listen(PORT, () => {
      console.log(`📊 Aleph Data Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
