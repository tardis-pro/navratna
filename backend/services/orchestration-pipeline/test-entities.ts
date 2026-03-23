import { DatabaseService } from '@uaip/infra/database';
import { allEntities } from '@uaip/shared-services';

const db = DatabaseService.getInstance();
db.registerEntities(allEntities);

process.exit(0);
