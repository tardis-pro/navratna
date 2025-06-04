// Neo4j Schema Initialization for Tools System
// Description: Creates constraints, indexes, and initial schema for tool relationships
// Author: UAIP Team
// Date: 2024-12-04

// Create constraints for unique identifiers
CREATE CONSTRAINT tool_id_unique IF NOT EXISTS FOR (t:Tool) REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT agent_id_unique IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT capability_name_unique IF NOT EXISTS FOR (c:Capability) REQUIRE c.name IS UNIQUE;
CREATE CONSTRAINT context_pattern_unique IF NOT EXISTS FOR (ctx:Context) REQUIRE ctx.pattern IS UNIQUE;

// Create indexes for performance
CREATE INDEX tool_category_index IF NOT EXISTS FOR (t:Tool) ON (t.category);
CREATE INDEX tool_name_index IF NOT EXISTS FOR (t:Tool) ON (t.name);
CREATE INDEX tool_capabilities_index IF NOT EXISTS FOR (t:Tool) ON (t.capabilities);
CREATE INDEX tool_tags_index IF NOT EXISTS FOR (t:Tool) ON (t.tags);
CREATE INDEX agent_usage_frequency_index IF NOT EXISTS FOR ()-[r:USES]-() ON (r.frequency);
CREATE INDEX agent_usage_success_rate_index IF NOT EXISTS FOR ()-[r:USES]-() ON (r.success_rate);
CREATE INDEX tool_relationship_strength_index IF NOT EXISTS FOR ()-[r:DEPENDS_ON|SIMILAR_TO|REPLACES|ENHANCES]-() ON (r.strength);

// Create sample tool nodes for testing
MERGE (t1:Tool {
  id: 'math-calculator',
  name: 'Math Calculator',
  category: 'computation',
  capabilities: ['arithmetic', 'algebra', 'trigonometry'],
  tags: ['math', 'calculation', 'basic'],
  security_level: 'safe',
  created_at: datetime()
});

MERGE (t2:Tool {
  id: 'text-analysis',
  name: 'Text Analysis',
  category: 'analysis',
  capabilities: ['sentiment', 'keywords', 'summarization'],
  tags: ['text', 'nlp', 'analysis'],
  security_level: 'safe',
  created_at: datetime()
});

MERGE (t3:Tool {
  id: 'time-utility',
  name: 'Time Utility',
  category: 'computation',
  capabilities: ['datetime', 'timezone', 'formatting'],
  tags: ['time', 'date', 'utility'],
  security_level: 'safe',
  created_at: datetime()
});

MERGE (t4:Tool {
  id: 'uuid-generator',
  name: 'UUID Generator',
  category: 'generation',
  capabilities: ['uuid', 'random', 'identifier'],
  tags: ['uuid', 'generator', 'utility'],
  security_level: 'safe',
  created_at: datetime()
});

MERGE (t5:Tool {
  id: 'file-reader',
  name: 'File Reader',
  category: 'file-system',
  capabilities: ['read', 'parse', 'validate'],
  tags: ['file', 'io', 'read'],
  security_level: 'moderate',
  created_at: datetime()
});

MERGE (t6:Tool {
  id: 'web-search',
  name: 'Web Search',
  category: 'web-search',
  capabilities: ['search', 'crawl', 'extract'],
  tags: ['web', 'search', 'internet'],
  security_level: 'restricted',
  created_at: datetime()
});

// Create capability nodes
MERGE (c1:Capability {name: 'arithmetic', description: 'Basic mathematical operations'});
MERGE (c2:Capability {name: 'text_processing', description: 'Text manipulation and analysis'});
MERGE (c3:Capability {name: 'data_generation', description: 'Generate various types of data'});
MERGE (c4:Capability {name: 'file_operations', description: 'File system operations'});
MERGE (c5:Capability {name: 'web_access', description: 'Internet and web access'});

// Create tool-capability relationships
MATCH (t:Tool {id: 'math-calculator'}), (c:Capability {name: 'arithmetic'})
MERGE (t)-[:PROVIDES]->(c);

MATCH (t:Tool {id: 'text-analysis'}), (c:Capability {name: 'text_processing'})
MERGE (t)-[:PROVIDES]->(c);

MATCH (t:Tool {id: 'uuid-generator'}), (c:Capability {name: 'data_generation'})
MERGE (t)-[:PROVIDES]->(c);

MATCH (t:Tool {id: 'file-reader'}), (c:Capability {name: 'file_operations'})
MERGE (t)-[:PROVIDES]->(c);

MATCH (t:Tool {id: 'web-search'}), (c:Capability {name: 'web_access'})
MERGE (t)-[:PROVIDES]->(c);

// Create tool relationships
MATCH (t1:Tool {id: 'math-calculator'}), (t2:Tool {id: 'text-analysis'})
MERGE (t1)-[:SIMILAR_TO {strength: 0.3, reason: 'Both are analytical tools', created_at: datetime()}]->(t2);

MATCH (t1:Tool {id: 'time-utility'}), (t2:Tool {id: 'uuid-generator'})
MERGE (t1)-[:SIMILAR_TO {strength: 0.7, reason: 'Both are utility tools', created_at: datetime()}]->(t2);

MATCH (t1:Tool {id: 'text-analysis'}), (t2:Tool {id: 'file-reader'})
MERGE (t1)-[:ENHANCES {strength: 0.8, reason: 'Text analysis can process file content', created_at: datetime()}]->(t2);

// Create sample agent nodes for testing
MERGE (a1:Agent {
  id: 'agent-001',
  name: 'Research Agent',
  type: 'research',
  created_at: datetime()
});

MERGE (a2:Agent {
  id: 'agent-002',
  name: 'Analysis Agent',
  type: 'analysis',
  created_at: datetime()
});

// Create sample usage patterns
MATCH (a:Agent {id: 'agent-001'}), (t:Tool {id: 'math-calculator'})
MERGE (a)-[:USES {
  frequency: 15,
  success_rate: 0.95,
  total_execution_time: 12500,
  success_count: 14,
  avg_execution_time: 833.33,
  last_used: datetime(),
  context_patterns: ['calculation', 'research', 'analysis']
}]->(t);

MATCH (a:Agent {id: 'agent-001'}), (t:Tool {id: 'text-analysis'})
MERGE (a)-[:USES {
  frequency: 8,
  success_rate: 0.875,
  total_execution_time: 16000,
  success_count: 7,
  avg_execution_time: 2000,
  last_used: datetime(),
  context_patterns: ['text', 'research', 'content']
}]->(t);

MATCH (a:Agent {id: 'agent-002'}), (t:Tool {id: 'text-analysis'})
MERGE (a)-[:USES {
  frequency: 25,
  success_rate: 0.92,
  total_execution_time: 45000,
  success_count: 23,
  avg_execution_time: 1800,
  last_used: datetime(),
  context_patterns: ['analysis', 'processing', 'nlp']
}]->(t);

// Create context patterns for recommendations
MERGE (ctx1:Context {
  pattern: 'mathematical_analysis',
  description: 'Tasks involving mathematical computation and analysis',
  keywords: ['math', 'calculation', 'analysis', 'computation']
});

MERGE (ctx2:Context {
  pattern: 'text_processing',
  description: 'Tasks involving text manipulation and analysis',
  keywords: ['text', 'nlp', 'content', 'analysis']
});

MERGE (ctx3:Context {
  pattern: 'data_generation',
  description: 'Tasks involving generating various types of data',
  keywords: ['generate', 'create', 'random', 'uuid']
});

// Create context-tool suggestions
MATCH (ctx:Context {pattern: 'mathematical_analysis'}), (t:Tool {id: 'math-calculator'})
MERGE (ctx)-[:SUGGESTS {strength: 0.9, priority: 1}]->(t);

MATCH (ctx:Context {pattern: 'text_processing'}), (t:Tool {id: 'text-analysis'})
MERGE (ctx)-[:SUGGESTS {strength: 0.95, priority: 1}]->(t);

MATCH (ctx:Context {pattern: 'data_generation'}), (t:Tool {id: 'uuid-generator'})
MERGE (ctx)-[:SUGGESTS {strength: 0.85, priority: 1}]->(t);

MATCH (ctx:Context {pattern: 'data_generation'}), (t:Tool {id: 'time-utility'})
MERGE (ctx)-[:SUGGESTS {strength: 0.7, priority: 2}]->(t);

// Create capability dependencies
MATCH (c1:Capability {name: 'text_processing'}), (c2:Capability {name: 'file_operations'})
MERGE (c1)-[:BENEFITS_FROM {strength: 0.8}]->(c2);

MATCH (c1:Capability {name: 'web_access'}), (c2:Capability {name: 'text_processing'})
MERGE (c1)-[:BENEFITS_FROM {strength: 0.6}]->(c2); 