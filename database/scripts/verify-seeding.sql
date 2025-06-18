-- UAIP Database Seeding Verification Script
-- This script verifies that all seeded data was created correctly

-- ===== VERIFICATION QUERIES =====

-- Check users
SELECT 
    'Users' as entity_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN is_active THEN 1 END) as active_count,
    COUNT(CASE WHEN role = 'system_admin' THEN 1 END) as system_admin_count,
    COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
    COUNT(CASE WHEN role = 'user' THEN 1 END) as user_count
FROM users;

-- Check roles
SELECT 
    'Roles' as entity_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN is_system_role THEN 1 END) as system_roles,
    COUNT(CASE WHEN NOT is_system_role THEN 1 END) as custom_roles
FROM roles;

-- Check permissions
SELECT 
    'Permissions' as entity_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN type = 'resource' THEN 1 END) as resource_permissions,
    COUNT(CASE WHEN type = 'system' THEN 1 END) as system_permissions
FROM permissions;

-- Check capabilities
SELECT 
    'Capabilities' as entity_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
    COUNT(CASE WHEN type = 'tool' THEN 1 END) as tool_count,
    COUNT(CASE WHEN type = 'artifact' THEN 1 END) as artifact_count,
    COUNT(CASE WHEN type = 'hybrid' THEN 1 END) as hybrid_count
FROM capabilities;

-- Check personas
SELECT 
    'Personas' as entity_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
    COUNT(CASE WHEN visibility = 'public' THEN 1 END) as public_count,
    COUNT(CASE WHEN visibility = 'team' THEN 1 END) as team_count,
    COUNT(CASE WHEN visibility = 'private' THEN 1 END) as private_count
FROM personas;

-- Check discussions
SELECT 
    'Discussions' as entity_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
FROM discussions;

-- Check discussion participants
SELECT 
    'Discussion Participants' as entity_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN participant_type = 'persona' THEN 1 END) as persona_participants,
    COUNT(CASE WHEN participant_type = 'user' THEN 1 END) as user_participants,
    COUNT(CASE WHEN is_active THEN 1 END) as active_participants
FROM discussion_participants;

-- Check role assignments
SELECT 
    'Role Assignments' as entity_type,
    COUNT(*) as total_assignments,
    COUNT(DISTINCT user_id) as users_with_roles,
    COUNT(DISTINCT role_id) as roles_assigned
FROM user_roles;

-- Check permission assignments
SELECT 
    'Permission Assignments' as entity_type,
    COUNT(*) as total_assignments,
    COUNT(DISTINCT role_id) as roles_with_permissions,
    COUNT(DISTINCT permission_id) as permissions_assigned
FROM role_permissions;

-- ===== DETAILED VERIFICATION =====

-- Verify specific system entities exist
DO $$
DECLARE
    missing_entities TEXT[] := '{}';
    entity_name TEXT;
    entity_count INTEGER;
BEGIN
    -- Check system users
    SELECT COUNT(*) INTO entity_count FROM users WHERE id = '00000000-0000-0000-0000-000000000001';
    IF entity_count = 0 THEN
        missing_entities := array_append(missing_entities, 'System User');
    END IF;
    
    SELECT COUNT(*) INTO entity_count FROM users WHERE id = '00000000-0000-0000-0000-000000000002';
    IF entity_count = 0 THEN
        missing_entities := array_append(missing_entities, 'Admin User');
    END IF;
    
    -- Check system roles
    SELECT COUNT(*) INTO entity_count FROM roles WHERE id = '10000000-0000-0000-0000-000000000001';
    IF entity_count = 0 THEN
        missing_entities := array_append(missing_entities, 'System Admin Role');
    END IF;
    
    -- Check system personas
    SELECT COUNT(*) INTO entity_count FROM personas WHERE id = '40000000-0000-0000-0000-000000000001';
    IF entity_count = 0 THEN
        missing_entities := array_append(missing_entities, 'Socratic Philosopher Persona');
    END IF;
    
    SELECT COUNT(*) INTO entity_count FROM personas WHERE id = '40000000-0000-0000-0000-000000000002';
    IF entity_count = 0 THEN
        missing_entities := array_append(missing_entities, 'Creative Brainstormer Persona');
    END IF;
    
    -- Check system discussions
    SELECT COUNT(*) INTO entity_count FROM discussions WHERE id = '50000000-0000-0000-0000-000000000001';
    IF entity_count = 0 THEN
        missing_entities := array_append(missing_entities, 'AI Ethics Discussion');
    END IF;
    
    -- Report results
    IF array_length(missing_entities, 1) > 0 THEN
        RAISE WARNING 'Missing system entities: %', array_to_string(missing_entities, ', ');
    ELSE
        RAISE NOTICE 'All system entities verified successfully';
    END IF;
END $$;

-- ===== RELATIONSHIP VERIFICATION =====

-- Verify foreign key relationships
SELECT 
    'Persona-User Relationships' as relationship_type,
    COUNT(*) as total_personas,
    COUNT(CASE WHEN u.id IS NOT NULL THEN 1 END) as valid_created_by,
    COUNT(CASE WHEN u.id IS NULL THEN 1 END) as invalid_created_by
FROM personas p
LEFT JOIN users u ON p.created_by = u.id;

-- Verify discussion-user relationships
SELECT 
    'Discussion-User Relationships' as relationship_type,
    COUNT(*) as total_discussions,
    COUNT(CASE WHEN u.id IS NOT NULL THEN 1 END) as valid_created_by,
    COUNT(CASE WHEN u.id IS NULL THEN 1 END) as invalid_created_by
FROM discussions d
LEFT JOIN users u ON d.created_by = u.id;

-- Verify discussion participant relationships
SELECT 
    'Discussion-Participant Relationships' as relationship_type,
    COUNT(*) as total_participants,
    COUNT(CASE WHEN d.id IS NOT NULL THEN 1 END) as valid_discussion_refs,
    COUNT(CASE WHEN d.id IS NULL THEN 1 END) as invalid_discussion_refs
FROM discussion_participants dp
LEFT JOIN discussions d ON dp.discussion_id = d.id;

-- ===== FINAL SUMMARY =====

DO $$
DECLARE
    user_count INTEGER;
    role_count INTEGER;
    permission_count INTEGER;
    capability_count INTEGER;
    persona_count INTEGER;
    discussion_count INTEGER;
    participant_count INTEGER;
    audit_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO role_count FROM roles;
    SELECT COUNT(*) INTO permission_count FROM permissions;
    SELECT COUNT(*) INTO capability_count FROM capabilities;
    SELECT COUNT(*) INTO persona_count FROM personas;
    SELECT COUNT(*) INTO discussion_count FROM discussions;
    SELECT COUNT(*) INTO participant_count FROM discussion_participants;
    SELECT COUNT(*) INTO audit_count FROM audit_events;
    
    RAISE NOTICE '=== UAIP Database Seeding Verification Complete ===';
    RAISE NOTICE 'Users: % (Expected: 4)', user_count;
    RAISE NOTICE 'Roles: % (Expected: 5)', role_count;
    RAISE NOTICE 'Permissions: % (Expected: 4)', permission_count;
    RAISE NOTICE 'Capabilities: % (Expected: 4)', capability_count;
    RAISE NOTICE 'Personas: % (Expected: 5)', persona_count;
    RAISE NOTICE 'Discussions: % (Expected: 3)', discussion_count;
    RAISE NOTICE 'Discussion Participants: % (Expected: 7)', participant_count;
    RAISE NOTICE 'Audit Events: % (Expected: 1+)', audit_count;
    
    IF user_count >= 4 AND role_count >= 5 AND permission_count >= 4 AND 
       capability_count >= 4 AND persona_count >= 5 AND discussion_count >= 3 THEN
        RAISE NOTICE '✅ Database seeding verification PASSED';
    ELSE
        RAISE WARNING '❌ Database seeding verification FAILED - some entities are missing';
    END IF;
    
    RAISE NOTICE '=== Verification Complete ===';
END $$; 