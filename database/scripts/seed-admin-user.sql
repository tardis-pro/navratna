-- UAIP Admin User Seeding Script
-- This script creates a new admin user with proper role assignments and permissions
-- Run this script to add a new admin user to the system

-- Enable UUID extension (in case it's not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== SEED NEW ADMIN USER =====
-- Create a new admin user with a secure default password
-- Note: The password should be changed on first login

DO $$
DECLARE
    new_user_id UUID := uuid_generate_v4();
    user_exists INTEGER;
BEGIN
    -- Check if user already exists
    SELECT COUNT(*) INTO user_exists FROM users WHERE email = 'newadmin@uaip.local';
    
    IF user_exists > 0 THEN
        RAISE NOTICE 'User newadmin@uaip.local already exists. Skipping creation.';
    ELSE
        -- Insert new admin user
        INSERT INTO users (
            id,
            email,
            role,
            password_hash,
            security_clearance,
            is_active,
            first_name,
            last_name,
            department,
            failed_login_attempts,
            created_at,
            updated_at
        ) VALUES (
            new_user_id,
            'newadmin@uaip.local',
            'admin',
            '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9PS', -- Password: 'AdminPass123!'
            'high',
            true,
            'New',
            'Administrator',
            'IT Administration',
            0,
            NOW(),
            NOW()
        );

        -- Log the creation in audit events
        INSERT INTO audit_events (
            id,
            event_type,
            user_id,
            resource_type,
            resource_id,
            details,
            risk_level,
            timestamp,
            is_archived,
            created_at,
            updated_at
        ) VALUES (
            uuid_generate_v4(),
            'admin_user_created',
            new_user_id,
            'user',
            new_user_id::text,
            jsonb_build_object(
                'operation', 'admin_user_seeding',
                'email', 'newadmin@uaip.local',
                'role', 'admin',
                'security_clearance', 'high',
                'created_by', 'database_seeding_script'
            ),
            'medium',
            NOW(),
            false,
            NOW(),
            NOW()
        );

        RAISE NOTICE '✅ New admin user created successfully!';
        RAISE NOTICE 'Email: newadmin@uaip.local';
        RAISE NOTICE 'Password: AdminPass123! (CHANGE THIS ON FIRST LOGIN)';
        RAISE NOTICE 'Role: admin';
        RAISE NOTICE 'Security Clearance: high';
        RAISE NOTICE 'User ID: %', new_user_id;
    END IF;
END $$;

-- ===== VERIFICATION =====
-- Verify the new admin user was created correctly

DO $$
DECLARE
    user_count INTEGER;
    audit_count INTEGER;
BEGIN
    -- Check if user exists
    SELECT COUNT(*) INTO user_count 
    FROM users 
    WHERE email = 'newadmin@uaip.local' AND role = 'admin' AND is_active = true;
    
    -- Check if audit event was created
    SELECT COUNT(*) INTO audit_count
    FROM audit_events
    WHERE event_type = 'admin_user_created' 
    AND resource_id = (SELECT id::text FROM users WHERE email = 'newadmin@uaip.local');
    
    IF user_count = 1 AND audit_count = 1 THEN
        RAISE NOTICE '✅ Admin user verification PASSED';
        RAISE NOTICE 'User exists: %', user_count;
        RAISE NOTICE 'Audit event created: %', audit_count;
    ELSE
        RAISE WARNING '❌ Admin user verification FAILED';
        RAISE WARNING 'User exists: %', user_count;
        RAISE WARNING 'Audit event created: %', audit_count;
    END IF;
END $$;

-- ===== DISPLAY USER INFORMATION =====
-- Show the created user details

SELECT 
    u.id,
    u.email,
    u.role,
    u.security_clearance,
    u.is_active,
    u.first_name,
    u.last_name,
    u.department,
    u.failed_login_attempts,
    u.locked_until,
    u.password_changed_at,
    u.last_login_at,
    u.created_at,
    u.updated_at
FROM users u
WHERE u.email = 'newadmin@uaip.local';

-- ===== SECURITY REMINDER =====
-- Display important security information

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔐 SECURITY REMINDER:';
    RAISE NOTICE '1. Change the default password immediately after first login';
    RAISE NOTICE '2. Enable two-factor authentication if available';
    RAISE NOTICE '3. Review and update user permissions as needed';
    RAISE NOTICE '4. Monitor admin user activity through audit logs';
    RAISE NOTICE '5. Consider setting password expiration policies';
    RAISE NOTICE '';
    RAISE NOTICE '📧 Login credentials:';
    RAISE NOTICE 'Email: newadmin@uaip.local';
    RAISE NOTICE 'Password: AdminPass123!';
    RAISE NOTICE '';
END $$; 