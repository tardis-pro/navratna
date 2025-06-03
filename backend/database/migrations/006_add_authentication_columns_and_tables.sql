-- Migration 006: Add Authentication Columns and Tables
-- This migration adds missing authentication-related columns to the users table
-- and creates missing authentication tables that the application expects

-- Add missing columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP,
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS department VARCHAR(100);

-- Create refresh_tokens table (referenced in auth code)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create password_reset_tokens table (referenced in auth code)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_password_changed_at ON users(password_changed_at);
CREATE INDEX IF NOT EXISTS idx_users_failed_login_attempts ON users(failed_login_attempts);
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until);
CREATE INDEX IF NOT EXISTS idx_users_first_name ON users(first_name);
CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_used_at ON password_reset_tokens(used_at);

-- Add triggers for updated_at on new tables
CREATE TRIGGER update_refresh_tokens_updated_at 
    BEFORE UPDATE ON refresh_tokens 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add constraints
ALTER TABLE users 
ADD CONSTRAINT chk_failed_login_attempts_non_negative 
CHECK (failed_login_attempts >= 0);

-- Add comments for documentation
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.password_changed_at IS 'Timestamp when password was last changed';
COMMENT ON COLUMN users.failed_login_attempts IS 'Number of consecutive failed login attempts';
COMMENT ON COLUMN users.locked_until IS 'Account locked until this timestamp due to failed login attempts';
COMMENT ON COLUMN users.first_name IS 'User first name';
COMMENT ON COLUMN users.last_name IS 'User last name';
COMMENT ON COLUMN users.department IS 'User department or organizational unit';

COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for user sessions';
COMMENT ON TABLE password_reset_tokens IS 'Tokens for password reset functionality'; 