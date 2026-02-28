import { DatabaseService } from '@uaip/infra/database';
import { allEntities } from '@uaip/shared-services';

console.log('allEntities count:', allEntities.length);
console.log('Has ProjectEntity:', allEntities.some((e: any) => e.name === 'ProjectEntity'));
console.log('Project entities:', allEntities.filter((e: any) => e.name?.includes('Project')).map((e: any) => e.name));

const db = DatabaseService.getInstance();
db.registerEntities(allEntities);
const ds = await db.getDataSource();
const entityNames = ds.entityMetadatas.map((m: any) => m.name);
console.log('DataSource entity count:', entityNames.length);
console.log('DataSource has ProjectEntity:', entityNames.includes('ProjectEntity'));
process.exit(0);
