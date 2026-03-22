import { DatabaseService } from '@uaip/infra/database';
import { allEntities } from '@uaip/shared-services';

const db = DatabaseService.getInstance();
db.registerEntities(allEntities);
const ds = await db.getDataSource();
const entityNames = ds.entityMetadatas.map((m: any) => m.name);

process.exit(0);
