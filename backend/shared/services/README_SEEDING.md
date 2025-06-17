# Database Seeding Guide

This guide explains how to seed your UAIP database with comprehensive sample data for development and testing.

## Overview

The database seeding script populates your database with realistic sample data including:

- **Users** (5 users with different roles and security levels)
- **Security Policies** (2 policies for different security scenarios)
- **Personas** (2 diverse persona profiles)
- **Agents** (2 intelligent agents with different capabilities)
- **Tool Definitions** (2 tools for data analysis and code generation)
- **Operations** (2 completed operations with full lifecycle data)
- **Audit Events** (3 audit events tracking system activity)

## Prerequisites

1. **Database Setup**: Ensure your PostgreSQL database is running and accessible
2. **Environment Variables**: Configure your database connection in `.env` file
3. **Migrations**: Run all database migrations before seeding

## Running the Seed Script

### Option 1: Direct TypeScript Execution (Recommended)
```bash
cd shared/services
pnpm seed
```

### Option 2: Build and Run
```bash
cd shared/services
pnpm seed:build
```

### Option 3: Manual Execution
```bash
cd shared/services
tsx src/database/seedScript.ts
```

## Sample User Accounts

After seeding, you can log in with these accounts:

| Email | Password | Role | Security Level |
|-------|----------|------|----------------|
| admin@uaip.dev | admin123! | System Admin | Critical |
| manager@uaip.dev | manager123! | Operations Manager | High |
| analyst@uaip.dev | analyst123! | Data Analyst | Medium |
| developer@uaip.dev | dev123! | Developer | Medium |
| guest@uaip.dev | guest123! | Guest | Low |

## What Gets Seeded

### Users
- 5 users with different roles (admin, manager, analyst, developer, guest)
- Different security clearance levels
- Realistic profile information
- Hashed passwords using bcrypt

### Security Policies
- **High Security Operations Policy**: Requires dual approval for critical operations
- **Standard Operations Policy**: Default policy for routine operations

### Personas
- **Technical Analyst**: Data-focused, analytical personality
- **Creative Problem Solver**: Innovation-focused, collaborative personality

### Agents
- **DataMaster Pro**: Advanced data analysis agent with high security
- **CodeCraft Assistant**: Software development specialist agent

### Tool Definitions
- **Data Analyzer**: Statistical analysis and visualization tool
- **Code Generator**: Multi-language code generation tool

### Operations
- **Quarterly Sales Analysis**: Completed data analysis operation
- **API Endpoint Generation**: Completed code generation operation

### Audit Events
- User login events
- Operation lifecycle events
- Permission and authorization events

## Customizing the Seed Data

To customize the seed data:

1. Edit `src/database/seedScript.ts`
2. Modify the data arrays for each entity type
3. Add new entities or relationships as needed
4. Run the seed script again

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Verify your database is running
   - Check your `.env` configuration
   - Ensure database credentials are correct

2. **Migration Required**
   - Run `pnpm migration:run` before seeding
   - Ensure all migrations are up to date

3. **Duplicate Key Errors**
   - The script doesn't handle existing data
   - Clear your database or use fresh schema
   - Consider adding conflict resolution logic

4. **Type Import Errors**
   - Ensure all shared packages are built
   - Run `pnpm build` in shared directories
   - Check TypeScript configuration

### Clearing Data

To clear seeded data and start fresh:

```bash
# Drop and recreate schema (WARNING: Destroys all data)
pnpm schema:drop
pnpm migration:run
pnpm seed
```

## Security Notes

- **Development Only**: This seeding script is for development/testing only
- **Weak Passwords**: Sample passwords are simple for testing purposes
- **Sample Data**: All data is fictional and for demonstration only
- **Production Warning**: Never run this script against production databases

## Next Steps

After seeding:

1. **Test Authentication**: Try logging in with the sample accounts
2. **Explore Entities**: Use the API to browse seeded data
3. **Test Operations**: Create new operations using the seeded agents
4. **Verify Relationships**: Check that entity relationships work correctly

## Support

If you encounter issues with seeding:

1. Check the console output for specific error messages
2. Verify database connectivity and permissions
3. Ensure all dependencies are installed
4. Review the TypeScript compilation output

The seeding script provides detailed console output to help debug any issues. 