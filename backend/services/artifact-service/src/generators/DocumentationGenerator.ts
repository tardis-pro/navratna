// Documentation Generator - Generates technical documentation
// Epic 4 Implementation

import { 
  ArtifactConversationContext
} from '@uaip/types';

import { ArtifactGenerator } from '../interfaces';
import { logger } from '@uaip/utils';

export class DocumentationGenerator implements ArtifactGenerator {
  private readonly supportedType = 'documentation';
  
  /**
   * Check if this generator can handle the given context
   */
  canHandle(context: ArtifactConversationContext): boolean {
    const messages = context.messages;
    const recentMessages = messages.slice(-5);

    // Look for documentation-related keywords
    const docKeywords = [
      'documentation', 'docs', 'readme', 'guide', 'manual', 'api docs', 'help'
    ];

    const hasDocContext = recentMessages.some(message => 
      docKeywords.some(keyword => 
        message.content.toLowerCase().includes(keyword)
      )
    );

    // Check for explicit documentation requests
    const docRequestPatterns = [
      /create.*documentation/i,
      /write.*docs/i,
      /document.*this/i,
      /readme/i,
      /api.*documentation/i
    ];

    const hasDocRequest = recentMessages.some(message =>
      docRequestPatterns.some(pattern => pattern.test(message.content))
    );

    return hasDocContext || hasDocRequest;
  }

  /**
   * Generate documentation artifact from conversation context
   */
  async generate(context: ArtifactConversationContext): Promise<string> {
    logger.info('Generating documentation artifact', {
      conversationId: context.conversationId,
      messageCount: context.messages.length
    });

    try {
      // Extract documentation requirements from conversation
      const docType = this.detectDocumentationType(context.messages);
      const projectName = this.extractProjectName(context.messages) || 'Project';
      const features = this.extractFeatures(context.messages);
      const apiEndpoints = this.extractAPIEndpoints(context.messages);
      
      // Generate documentation based on type
      switch (docType) {
        case 'readme':
          return this.generateReadme(projectName, features);
        case 'api':
          return this.generateAPIDocumentation(projectName, apiEndpoints);
        case 'user-guide':
          return this.generateUserGuide(projectName, features);
        default:
          return this.generateGenericDocumentation(projectName, features);
      }

    } catch (error) {
      logger.error('Documentation generation failed:', error);
      throw new Error(`Documentation generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get supported artifact type
   */
  getSupportedType(): string {
    return this.supportedType;
  }

  /**
   * Get supported artifact types
   */
  getSupportedTypes(): string[] {
    return ['documentation'];
  }

  // Private helper methods

  private detectDocumentationType(messages: any[]): string {
    for (const message of messages) {
      const content = message.content.toLowerCase();
      
      if (content.includes('readme') || content.includes('getting started')) {
        return 'readme';
      }
      if (content.includes('api') || content.includes('endpoint')) {
        return 'api';
      }
      if (content.includes('user guide') || content.includes('manual')) {
        return 'user-guide';
      }
    }
    
    return 'generic';
  }

  private extractProjectName(messages: any[]): string | null {
    for (const message of messages) {
      const projectMatch = message.content.match(/project\s+(\w+)|(\w+)\s*project|building\s+(\w+)|creating\s+(\w+)/i);
      if (projectMatch) {
        return projectMatch[1] || projectMatch[2] || projectMatch[3] || projectMatch[4];
      }
    }
    return null;
  }

  private extractFeatures(messages: any[]): string[] {
    const features: string[] = [];
    
    for (const message of messages) {
      const content = message.content.toLowerCase();
      
      if (content.includes('feature') || content.includes('functionality')) {
        const sentences = message.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (/feature|functionality|capability|function/i.test(sentence)) {
            features.push(sentence.trim());
          }
        }
      }
    }
    
    return features.slice(0, 8);
  }

  private extractAPIEndpoints(messages: any[]): string[] {
    const endpoints: string[] = [];
    
    for (const message of messages) {
      // Look for API endpoint patterns
      const endpointMatches = message.content.match(/\/api\/[^\s]+|GET|POST|PUT|DELETE\s+\/[^\s]+/gi);
      if (endpointMatches) {
        endpoints.push(...endpointMatches);
      }
    }
    
    return [...new Set(endpoints)].slice(0, 10); // Remove duplicates and limit
  }

  private generateReadme(projectName: string, features: string[]): string {
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `# ${projectName}

A brief description of ${projectName} and what it does.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

## Installation

\`\`\`bash
# Clone the repository
git clone https://github.com/your-username/${projectName.toLowerCase()}.git

# Navigate to the project directory
cd ${projectName.toLowerCase()}

# Install dependencies
npm install
\`\`\`

## Usage

### Quick Start

\`\`\`bash
# Start the application
npm start
\`\`\`

### Basic Example

\`\`\`javascript
// Example usage of ${projectName}
const ${projectName.toLowerCase()} = require('${projectName.toLowerCase()}');

// Initialize
const app = new ${projectName}();

// Use the application
app.start();
\`\`\`

## Features

${features.length > 0 ? features.map(feature => `- ${feature}`).join('\n') : '- Core functionality\n- User-friendly interface\n- Extensible architecture'}

## API Reference

### Main Methods

#### \`start()\`
Starts the application.

#### \`stop()\`
Stops the application gracefully.

#### \`configure(options)\`
Configures the application with the provided options.

**Parameters:**
- \`options\` (Object): Configuration options

## Configuration

Create a \`config.json\` file in the root directory:

\`\`\`json
{
  "port": 3000,
  "environment": "development",
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "${projectName.toLowerCase()}_db"
  }
}
\`\`\`

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Database (if applicable)

### Setup Development Environment

\`\`\`bash
# Install development dependencies
npm install --dev

# Run tests
npm test

# Run in development mode
npm run dev
\`\`\`

### Running Tests

\`\`\`bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
\`\`\`

## Contributing

1. Fork the repository
2. Create a feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit your changes (\`git commit -m 'Add some amazing feature'\`)
4. Push to the branch (\`git push origin feature/amazing-feature\`)
5. Open a Pull Request

### Code Style

This project uses ESLint and Prettier for code formatting. Run the following before committing:

\`\`\`bash
npm run lint
npm run format
\`\`\`

## Deployment

### Production Build

\`\`\`bash
# Create production build
npm run build

# Start production server
npm run start:prod
\`\`\`

### Docker

\`\`\`bash
# Build Docker image
docker build -t ${projectName.toLowerCase()} .

# Run container
docker run -p 3000:3000 ${projectName.toLowerCase()}
\`\`\`

## Troubleshooting

### Common Issues

**Issue: Application won't start**
- Check that all dependencies are installed
- Verify configuration files are present
- Check port availability

**Issue: Database connection errors**
- Verify database is running
- Check connection credentials
- Ensure database exists

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Documentation: [Link to docs]
- Issues: [GitHub Issues](https://github.com/your-username/${projectName.toLowerCase()}/issues)
- Discussions: [GitHub Discussions](https://github.com/your-username/${projectName.toLowerCase()}/discussions)

## Changelog

### [1.0.0] - ${timestamp}
- Initial release
- Core functionality implemented
- Basic documentation added

---

**Last Updated:** ${timestamp}`;
  }

  private generateAPIDocumentation(projectName: string, endpoints: string[]): string {
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `# ${projectName} API Documentation

## Overview

This document describes the REST API for ${projectName}.

**Base URL:** \`https://api.${projectName.toLowerCase()}.com/v1\`

**Version:** 1.0.0  
**Last Updated:** ${timestamp}

## Authentication

All API requests require authentication using an API key.

\`\`\`http
Authorization: Bearer YOUR_API_KEY
\`\`\`

## Rate Limiting

- 1000 requests per hour for authenticated users
- 100 requests per hour for unauthenticated users

## Response Format

All responses are returned in JSON format:

\`\`\`json
{
  "success": true,
  "data": {},
  "message": "Success",
  "timestamp": "2024-01-01T00:00:00Z"
}
\`\`\`

## Error Handling

Error responses include an error code and message:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request is invalid"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
\`\`\`

### Error Codes

| Code | Description |
|------|-------------|
| \`INVALID_REQUEST\` | The request is malformed |
| \`UNAUTHORIZED\` | Authentication required |
| \`FORBIDDEN\` | Insufficient permissions |
| \`NOT_FOUND\` | Resource not found |
| \`RATE_LIMITED\` | Too many requests |
| \`INTERNAL_ERROR\` | Server error |

## Endpoints

${endpoints.length > 0 ? this.generateEndpointDocs(endpoints) : this.generateDefaultEndpoints()}

## Data Models

### User

\`\`\`json
{
  "id": "string",
  "email": "string",
  "name": "string",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
\`\`\`

### Resource

\`\`\`json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "status": "string",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
\`\`\`

## SDK Examples

### JavaScript/Node.js

\`\`\`javascript
const ${projectName}API = require('${projectName.toLowerCase()}-api');

const client = new ${projectName}API({
  apiKey: 'your-api-key',
  baseURL: 'https://api.${projectName.toLowerCase()}.com/v1'
});

// Get all resources
const resources = await client.resources.list();

// Create a new resource
const newResource = await client.resources.create({
  title: 'New Resource',
  description: 'Resource description'
});
\`\`\`

### Python

\`\`\`python
import ${projectName.toLowerCase()}_api

client = ${projectName.toLowerCase()}_api.Client(
    api_key='your-api-key',
    base_url='https://api.${projectName.toLowerCase()}.com/v1'
)

# Get all resources
resources = client.resources.list()

# Create a new resource
new_resource = client.resources.create({
    'title': 'New Resource',
    'description': 'Resource description'
})
\`\`\`

## Webhooks

${projectName} supports webhooks for real-time notifications.

### Webhook Events

- \`resource.created\`
- \`resource.updated\`
- \`resource.deleted\`
- \`user.created\`

### Webhook Payload

\`\`\`json
{
  "event": "resource.created",
  "data": {
    "id": "resource-id",
    "title": "Resource Title"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
\`\`\`

## Testing

Use the following test credentials for development:

- **API Key:** \`test_key_123456789\`
- **Base URL:** \`https://api-staging.${projectName.toLowerCase()}.com/v1\`

## Support

- Email: api-support@${projectName.toLowerCase()}.com
- Documentation: https://docs.${projectName.toLowerCase()}.com
- Status Page: https://status.${projectName.toLowerCase()}.com

---

**Generated on:** ${timestamp}`;
  }

  private generateUserGuide(projectName: string, features: string[]): string {
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `# ${projectName} User Guide

Welcome to ${projectName}! This guide will help you get started and make the most of the application.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Features](#basic-features)
3. [Advanced Features](#advanced-features)
4. [Tips and Tricks](#tips-and-tricks)
5. [Troubleshooting](#troubleshooting)
6. [FAQ](#faq)

## Getting Started

### First Time Setup

1. **Create an Account**
   - Visit the registration page
   - Fill in your details
   - Verify your email address

2. **Initial Configuration**
   - Complete your profile
   - Set your preferences
   - Configure notifications

3. **Take the Tour**
   - Follow the guided tour
   - Explore the main features
   - Try the sample workflows

### Navigation

The main interface consists of:

- **Header**: Navigation menu and user controls
- **Sidebar**: Quick access to main features
- **Main Area**: Primary workspace
- **Footer**: Status information and links

## Basic Features

${features.length > 0 ? features.map((feature, index) => `
### ${index + 1}. ${feature}

**How to use:**
1. Navigate to the feature section
2. Follow the on-screen instructions
3. Save your changes when complete

**Tips:**
- Use keyboard shortcuts for faster access
- Check the help tooltips for additional information
`).join('\n') : `
### Core Functionality

**How to use:**
1. Access the main dashboard
2. Select your desired action
3. Follow the workflow prompts

**Tips:**
- Save your work frequently
- Use the search function to find items quickly
`}

## Advanced Features

### Customization

You can customize ${projectName} to fit your workflow:

- **Themes**: Choose from light or dark themes
- **Layout**: Adjust the interface layout
- **Shortcuts**: Create custom keyboard shortcuts
- **Integrations**: Connect with other tools

### Automation

Set up automated workflows to save time:

1. Go to Settings > Automation
2. Create a new workflow
3. Define triggers and actions
4. Test and activate

### Collaboration

Work with team members effectively:

- **Sharing**: Share projects and resources
- **Comments**: Add comments and feedback
- **Permissions**: Control access levels
- **Notifications**: Stay updated on changes

## Tips and Tricks

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| \`Ctrl+N\` | Create new item |
| \`Ctrl+S\` | Save current work |
| \`Ctrl+F\` | Search |
| \`Ctrl+Z\` | Undo |
| \`Ctrl+Y\` | Redo |

### Best Practices

1. **Organization**
   - Use clear naming conventions
   - Create logical folder structures
   - Tag items for easy searching

2. **Performance**
   - Close unused tabs
   - Clear cache regularly
   - Use filters to reduce data load

3. **Security**
   - Use strong passwords
   - Enable two-factor authentication
   - Log out when finished

## Troubleshooting

### Common Issues

**Problem: Can't log in**
- Check your username and password
- Verify your account is active
- Try resetting your password

**Problem: Features not loading**
- Check your internet connection
- Clear browser cache
- Try a different browser

**Problem: Data not saving**
- Ensure you have sufficient permissions
- Check available storage space
- Verify network connectivity

### Getting Help

If you need additional assistance:

1. **Help Center**: Check our knowledge base
2. **Contact Support**: Email support@${projectName.toLowerCase()}.com
3. **Community Forum**: Ask questions and share tips
4. **Live Chat**: Available during business hours

## FAQ

**Q: Is my data secure?**
A: Yes, we use industry-standard encryption and security measures.

**Q: Can I export my data?**
A: Yes, you can export your data in various formats from the Settings page.

**Q: Is there a mobile app?**
A: Currently, ${projectName} is web-based and mobile-responsive.

**Q: How do I cancel my subscription?**
A: You can cancel anytime from your account settings.

## Updates and Changelog

We regularly update ${projectName} with new features and improvements. Check the changelog for recent updates:

- **Version 1.0** (${timestamp}): Initial release
- More updates coming soon!

## Feedback

We value your feedback! Please share your thoughts:

- **Feature Requests**: Submit via our feedback form
- **Bug Reports**: Email bugs@${projectName.toLowerCase()}.com
- **General Feedback**: Contact us anytime

---

**Last Updated:** ${timestamp}  
**Version:** 1.0`;
  }

  private generateGenericDocumentation(projectName: string, features: string[]): string {
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `# ${projectName} Documentation

## Overview

${projectName} is a comprehensive solution designed to meet your needs. This documentation provides detailed information about its features and usage.

**Version:** 1.0.0  
**Last Updated:** ${timestamp}

## Features

${features.length > 0 ? features.map(feature => `- ${feature}`).join('\n') : '- Core functionality\n- User-friendly interface\n- Extensible architecture'}

## Getting Started

### Prerequisites

Before using ${projectName}, ensure you have:

- Required dependencies installed
- Proper permissions configured
- Network connectivity established

### Installation

Follow these steps to install ${projectName}:

1. Download the latest version
2. Extract the files
3. Run the installation script
4. Configure the settings

### Configuration

Configure ${projectName} by editing the configuration file:

\`\`\`json
{
  "name": "${projectName}",
  "version": "1.0.0",
  "settings": {
    "debug": false,
    "timeout": 30000
  }
}
\`\`\`

## Usage

### Basic Operations

1. **Starting the Application**
   - Launch the main executable
   - Wait for initialization
   - Access the interface

2. **Performing Tasks**
   - Select the desired operation
   - Provide required inputs
   - Execute the task

3. **Monitoring Progress**
   - Check the status indicators
   - Review logs for details
   - Handle any errors

### Advanced Usage

For advanced users, ${projectName} offers:

- Command-line interface
- API integration
- Custom scripting
- Plugin system

## Architecture

${projectName} follows a modular architecture:

- **Core Module**: Main functionality
- **Interface Layer**: User interaction
- **Data Layer**: Information storage
- **Integration Layer**: External connections

## Maintenance

### Regular Tasks

- Update to latest version
- Backup configuration
- Monitor performance
- Review logs

### Troubleshooting

Common issues and solutions:

1. **Performance Issues**
   - Check system resources
   - Optimize configuration
   - Clear temporary files

2. **Connection Problems**
   - Verify network settings
   - Check firewall rules
   - Test connectivity

## Support

For assistance with ${projectName}:

- **Documentation**: This guide and online resources
- **Community**: User forums and discussions
- **Professional**: Commercial support options

## License

${projectName} is licensed under the MIT License. See the LICENSE file for details.

---

**Document Version:** 1.0  
**Generated:** ${timestamp}`;
  }

  private generateEndpointDocs(endpoints: string[]): string {
    return endpoints.map(endpoint => {
      const method = endpoint.match(/^(GET|POST|PUT|DELETE)/i)?.[0] || 'GET';
      const path = endpoint.replace(/^(GET|POST|PUT|DELETE)\s+/i, '');
      
      return `
### ${method} ${path}

**Description:** [Endpoint description]

**Parameters:**
- \`param1\` (string, required): Description
- \`param2\` (number, optional): Description

**Request Example:**
\`\`\`http
${method} ${path}
Content-Type: application/json

{
  "param1": "value",
  "param2": 123
}
\`\`\`

**Response Example:**
\`\`\`json
{
  "success": true,
  "data": {
    "id": "123",
    "result": "success"
  }
}
\`\`\`
`;
    }).join('\n');
  }

  private generateDefaultEndpoints(): string {
    return `
### GET /health

**Description:** Check API health status

**Response Example:**
\`\`\`json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
\`\`\`

### GET /resources

**Description:** Get all resources

**Parameters:**
- \`limit\` (number, optional): Number of items to return
- \`offset\` (number, optional): Number of items to skip

**Response Example:**
\`\`\`json
{
  "success": true,
  "data": {
    "resources": [],
    "total": 0,
    "limit": 10,
    "offset": 0
  }
}
\`\`\`

### POST /resources

**Description:** Create a new resource

**Request Example:**
\`\`\`json
{
  "title": "New Resource",
  "description": "Resource description"
}
\`\`\`

**Response Example:**
\`\`\`json
{
  "success": true,
  "data": {
    "id": "123",
    "title": "New Resource",
    "description": "Resource description",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
\`\`\`
`;
  }
} 