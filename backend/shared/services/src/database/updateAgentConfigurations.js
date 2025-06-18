import { DatabaseService } from '../databaseService.js';

/**
 * Utility script to update existing agents with proper configuration values
 * Run this to fix agents that have empty or null configuration
 */
async function updateAgentConfigurations() {
  const databaseService = DatabaseService.getInstance();
  
  try {
    console.log('🔧 Starting agent configuration update...');
    
    // Initialize database connection
    await databaseService.initialize();
    
    // Get entity manager for raw queries
    const manager = await databaseService.getEntityManager();
    
    const defaultConfiguration = {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      analysisDepth: 'intermediate',
      contextWindowSize: 4000,
      decisionThreshold: 0.7,
      learningEnabled: true,
      collaborationMode: 'collaborative'
    };

    // Update agents with NULL configuration
    console.log('📝 Updating agents with NULL configuration...');
    const nullResult = await manager.query(`
      UPDATE agents 
      SET configuration = $1, updated_at = CURRENT_TIMESTAMP
      WHERE configuration IS NULL
    `, [JSON.stringify(defaultConfiguration)]);
    
    console.log(`✅ Updated ${nullResult.affectedRows || 0} agents with NULL configuration`);

    // Update agents with empty configuration object
    console.log('📝 Updating agents with empty configuration...');
    const emptyResult = await manager.query(`
      UPDATE agents 
      SET configuration = $1, updated_at = CURRENT_TIMESTAMP
      WHERE configuration = '{}'::jsonb
    `, [JSON.stringify(defaultConfiguration)]);
    
    console.log(`✅ Updated ${emptyResult.affectedRows || 0} agents with empty configuration`);

    // Verify the updates
    console.log('🔍 Verifying updates...');
    const verifyResult = await manager.query(`
      SELECT 
        COUNT(*) as total_agents,
        COUNT(CASE WHEN configuration IS NULL THEN 1 END) as null_config,
        COUNT(CASE WHEN configuration = '{}'::jsonb THEN 1 END) as empty_config,
        COUNT(CASE WHEN configuration IS NOT NULL AND configuration != '{}'::jsonb THEN 1 END) as valid_config
      FROM agents 
      WHERE is_active = true
    `);
    
    console.log('📊 Agent configuration status:');
    console.log(`   Total active agents: ${verifyResult[0].total_agents}`);
    console.log(`   Agents with NULL config: ${verifyResult[0].null_config}`);
    console.log(`   Agents with empty config: ${verifyResult[0].empty_config}`);
    console.log(`   Agents with valid config: ${verifyResult[0].valid_config}`);
    
    console.log('🎉 Agent configuration update completed successfully!');
    
  } catch (error) {
    console.error('❌ Error updating agent configurations:', error);
    throw error;
  } finally {
    // Close database connection
    await databaseService.close();
  }
}

// Run the update if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateAgentConfigurations()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export { updateAgentConfigurations }; 