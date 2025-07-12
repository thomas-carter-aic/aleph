-- Aleph AI Platform Database Schema
-- Initial migration for core tables

-- Events table for event sourcing
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY,
    aggregate_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_events_aggregate_id (aggregate_id),
    INDEX idx_events_created_at (created_at),
    INDEX idx_events_type (event_type)
);

-- Causal relationships table
CREATE TABLE IF NOT EXISTS causal_relationships (
    id UUID PRIMARY KEY,
    cause_event VARCHAR(255) NOT NULL,
    effect_event VARCHAR(255) NOT NULL,
    strength DECIMAL(3,2) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_causal_cause (cause_event),
    INDEX idx_causal_effect (effect_event)
);

-- AI Models table
CREATE TABLE IF NOT EXISTS ai_models (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'available',
    configuration JSONB NOT NULL,
    performance_metrics JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Agents table
CREATE TABLE IF NOT EXISTS ai_agents (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    capabilities JSONB NOT NULL,
    performance_metrics JSONB,
    configuration JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks table for agent orchestration
CREATE TABLE IF NOT EXISTS agent_tasks (
    id UUID PRIMARY KEY,
    agent_id VARCHAR(100) NOT NULL,
    type VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    priority VARCHAR(10) DEFAULT 'medium',
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (agent_id) REFERENCES ai_agents(id),
    INDEX idx_tasks_agent_id (agent_id),
    INDEX idx_tasks_status (status),
    INDEX idx_tasks_created_at (created_at)
);

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    permissions JSONB DEFAULT '[]',
    profile JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    
    INDEX idx_users_email (email),
    INDEX idx_users_role (role)
);

-- Temporal snapshots for performance optimization
CREATE TABLE IF NOT EXISTS temporal_snapshots (
    id UUID PRIMARY KEY,
    aggregate_id VARCHAR(255) NOT NULL,
    snapshot_data JSONB NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_snapshots_aggregate_id (aggregate_id),
    INDEX idx_snapshots_created_at (created_at)
);

-- Industry templates table
CREATE TABLE IF NOT EXISTS industry_templates (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(100) NOT NULL,
    template_data JSONB NOT NULL,
    compliance_requirements JSONB DEFAULT '[]',
    ai_models JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_templates_industry (industry)
);

-- Insert default data
INSERT INTO ai_models (id, name, type, configuration) VALUES
('llama2-7b', 'LLaMA 2 7B', 'llm', '{"endpoint": "http://localhost:11434", "capabilities": ["text-generation", "conversation"]}'),
('quantum-optimizer', 'Quantum Optimization Model', 'quantum-ml', '{"endpoint": "http://localhost:8080", "capabilities": ["optimization"]}'),
('causal-analyzer', 'Causal Analysis Model', 'causal-ai', '{"endpoint": "http://localhost:8081", "capabilities": ["causal-discovery"]}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_agents (id, name, type, capabilities) VALUES
('security-agent', 'Security Agent', 'security', '["threat-detection", "incident-response", "compliance-monitoring"]'),
('optimization-agent', 'Optimization Agent', 'optimization', '["performance-optimization", "resource-management", "cost-optimization"]'),
('compliance-agent', 'Compliance Agent', 'compliance', '["regulatory-compliance", "audit-preparation", "policy-enforcement"]')
ON CONFLICT (id) DO NOTHING;
