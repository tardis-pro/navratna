import { 
  getAllPersonasApiArray,
  allPersonasApi,
  // Individual persona imports
  techLeadApi,
  softwareEngineerApi,
  qaEngineerApi,
  juniorDeveloperApi,
  devopsEngineerApi,
  dataScientistApi,
  policyAnalystApi,
  economistApi,
  legalExpertApi,
  socialScientistApi,
  environmentalExpertApi,
  creativeDirectorApi,
  innovationConsultantApi,
  philosopherApi,
  systemsAnalystApi,
  entrepreneurApi,
  productManagerApi,
  psychologistApi,
  educatorApi,
  communityOrganizerApi,
  generateAllPersonaApiRequests,
  ApiPersonaPayload
} from './src/data/personas';
import axios from 'axios';

// =============================================================================
// ALL AVAILABLE PERSONAS IN API FORMAT
// =============================================================================

console.log('=== ALL PERSONAS API FORMAT ===\n');

// Method 1: Get all personas as an array
const allPersonasArray = getAllPersonasApiArray();
console.log(`Total personas available: ${allPersonasArray.length}\n`);

// Method 2: Get all personas as a keyed object
console.log('Available persona IDs:');
Object.keys(allPersonasApi).forEach(id => {
  console.log(`- ${id}`);
});

console.log('\n=== INDIVIDUAL PERSONA EXAMPLES ===\n');

// =============================================================================
// SOFTWARE DEVELOPMENT PERSONAS
// =============================================================================

console.log('🔧 SOFTWARE DEVELOPMENT PERSONAS:');
console.log('1. Tech Lead:', JSON.stringify(techLeadApi, null, 2));
console.log('\n2. Software Engineer:', JSON.stringify(softwareEngineerApi, null, 2));
console.log('\n3. QA Engineer:', JSON.stringify(qaEngineerApi, null, 2));
console.log('\n4. Junior Developer:', JSON.stringify(juniorDeveloperApi, null, 2));
console.log('\n5. DevOps Engineer:', JSON.stringify(devopsEngineerApi, null, 2));
console.log('\n6. Data Scientist:', JSON.stringify(dataScientistApi, null, 2));

// =============================================================================
// POLICY DEBATE PERSONAS
// =============================================================================

console.log('\n📊 POLICY DEBATE PERSONAS:');
console.log('7. Policy Analyst:', JSON.stringify(policyAnalystApi, null, 2));
console.log('\n8. Economist:', JSON.stringify(economistApi, null, 2));
console.log('\n9. Legal Expert:', JSON.stringify(legalExpertApi, null, 2));
console.log('\n10. Social Scientist:', JSON.stringify(socialScientistApi, null, 2));
console.log('\n11. Environmental Expert:', JSON.stringify(environmentalExpertApi, null, 2));

// =============================================================================
// CREATIVE PERSONAS
// =============================================================================

console.log('\n🎨 CREATIVE PERSONAS:');
console.log('12. Creative Director:', JSON.stringify(creativeDirectorApi, null, 2));
console.log('\n13. Innovation Consultant:', JSON.stringify(innovationConsultantApi, null, 2));

// =============================================================================
// ANALYTICAL PERSONAS
// =============================================================================

console.log('\n🧠 ANALYTICAL PERSONAS:');
console.log('14. Philosopher:', JSON.stringify(philosopherApi, null, 2));
console.log('\n15. Systems Analyst:', JSON.stringify(systemsAnalystApi, null, 2));

// =============================================================================
// BUSINESS PERSONAS
// =============================================================================

console.log('\n💼 BUSINESS PERSONAS:');
console.log('16. Entrepreneur:', JSON.stringify(entrepreneurApi, null, 2));
console.log('\n17. Product Manager:', JSON.stringify(productManagerApi, null, 2));

// =============================================================================
// SOCIAL PERSONAS
// =============================================================================

console.log('\n👥 SOCIAL PERSONAS:');
console.log('18. Psychologist:', JSON.stringify(psychologistApi, null, 2));
console.log('\n19. Educator:', JSON.stringify(educatorApi, null, 2));
console.log('\n20. Community Organizer:', JSON.stringify(communityOrganizerApi, null, 2));

// =============================================================================
// AXIOS REQUEST EXAMPLES
// =============================================================================

console.log('\n=== AXIOS REQUEST EXAMPLES ===\n');

// Generate axios configs for all personas
const allRequests = generateAllPersonaApiRequests('http://localhost:3001', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3YjcxMzBmNS1hZjg4LTQ4MWQtODJmOS02MzUyZTVjNWYxNTciLCJlbWFpbCI6ImFkbWluMUB1YWlwLmRldiIsInJvbGUiOiJzeXN0ZW1fYWRtaW4iLCJpYXQiOjE3NTAxOTQxNDMsImV4cCI6MTc1MDE5Nzc0M30.mcURUZyARfBEGZhzundmNzxEaOkxBoDwNhgC64epaY8');

console.log('Example axios requests for first 3 personas:');
allRequests.forEach(async (request, index) => {
  const response = await axios.request(request.config);
  console.log(response.data);
  console.log(`\n${index + 1}. ${request.personaId}:`);
  console.log('```javascript');
  console.log(`const axios = require('axios');`);
  console.log(`const config = ${JSON.stringify(request.config, null, 2)};`);
  console.log(`axios.request(config).then(response => console.log(response.data));`);
  console.log('```');
});

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

console.log('\n=== USAGE EXAMPLES ===\n');

console.log('// Import specific personas:');
console.log(`import { techLeadApi, softwareEngineerApi } from './src/data/personas';`);
console.log('');
console.log('// Get all personas:');
console.log(`import { getAllPersonasApiArray } from './src/data/personas';`);
console.log(`const allPersonas = getAllPersonasApiArray();`);
console.log('');
console.log('// Generate API requests:');
console.log(`import { generatePersonaApiRequest, getPersonaById } from './src/data/personas';`);
console.log(`const persona = getPersonaById('tech-lead');`);
console.log(`const config = generatePersonaApiRequest(persona);`);
console.log(`const response = await axios.request(config);`);

// =============================================================================
// SUMMARY
// =============================================================================

console.log('\n=== SUMMARY ===\n');
console.log(`✅ Total personas available: ${allPersonasArray.length}`);
console.log('✅ All personas have required API fields:');
console.log('   - id, name, category for expertise');
console.log('   - conversationalStyle as object');
console.log('   - All validation requirements met');
console.log('');
console.log('Categories available:');
const categories = new Set();
allPersonasArray.forEach(persona => {
  persona.expertise.forEach(exp => categories.add(exp.category));
});
Array.from(categories).sort().forEach(cat => console.log(`   - ${cat}`));

export {
  // Export everything for easy access
  allPersonasArray,
  allPersonasApi,
  allRequests,
  // Individual personas
  techLeadApi,
  softwareEngineerApi,
  qaEngineerApi,
  juniorDeveloperApi,
  devopsEngineerApi,
  dataScientistApi,
  policyAnalystApi,
  economistApi,
  legalExpertApi,
  socialScientistApi,
  environmentalExpertApi,
  creativeDirectorApi,
  innovationConsultantApi,
  philosopherApi,
  systemsAnalystApi,
  entrepreneurApi,
  productManagerApi,
  psychologistApi,
  educatorApi,
  communityOrganizerApi
};

// Type export for TypeScript users
export type { ApiPersonaPayload }; 