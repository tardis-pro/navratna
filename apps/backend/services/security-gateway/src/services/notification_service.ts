import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { logger, ExternalServiceError } from '@uaip/utils';
import { config } from '@uaip/config';
import { DatabaseService as _DatabaseService } from '@uaip/infra/database';
import { EventBusService as _EventBusService } from '@uaip/infra/event_bus';
import type {
  ApprovalNotification,
  NotificationTemplate,
  NotificationChannel,
} from '@uaip/types';

type NotificationRecipient = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  userId?: string;
};

type InAppNotificationRecord = {
  id: string;
  userId: string;
};

export class NotificationService {
  private emailTransporter: nodemailer.Transporter | null = null;
  private templates: Map<string, NotificationTemplate> = new Map();
  private channels: NotificationChannel[] = [];

  constructor() {
    this.initializeEmailTransporter();
    this.loadNotificationTemplates();
    this.setupNotificationChannels();
  }

  /**
   * Send approval notification
   */
  public async sendApprovalNotification(notification: ApprovalNotification): Promise<void> {
    try {
      logger.info('Sending approval notification', {
        type: notification.type,
        recipientId: notification.recipientId,
        workflowId: notification.workflowId,
      });

      // Get recipient details
      const recipient = await this.getRecipientDetails(notification.recipientId);
      if (!recipient) {
        logger.warn('Recipient not found for notification', {
          recipientId: notification.recipientId,
          workflowId: notification.workflowId,
        });
        return;
      }

      // Send via enabled channels
      const promises = this.channels
        .filter((channel) => channel.enabled)
        .map((channel) => this.sendViaChannel(channel, notification, recipient));

      await Promise.allSettled(promises);

      logger.info('Approval notification sent successfully', {
        type: notification.type,
        recipientId: notification.recipientId,
        workflowId: notification.workflowId,
        channels: this.channels.filter((c) => c.enabled).map((c) => c.type),
      });
    } catch (error) {
      logger.error('Failed to send approval notification', {
        type: notification.type,
        recipientId: notification.recipientId,
        workflowId: notification.workflowId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Send via specific channel
   */
  private async sendViaChannel(
    channel: NotificationChannel,
    notification: ApprovalNotification,
    recipient: NotificationRecipient
  ): Promise<void> {
    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmailNotification(notification, recipient);
          break;
        case 'in_app':
          await this.sendInAppNotification(notification, recipient);
          break;
        case 'webhook':
          await this.sendWebhookNotification(notification, recipient, channel.config);
          break;
        case 'sms':
          await this.sendSMSNotification(notification, recipient, channel.config);
          break;
        default:
          logger.warn('Unknown notification channel type', { type: channel.type });
      }
    } catch (error) {
      logger.error(`Failed to send notification via ${channel.type}`, {
        workflowId: notification.workflowId,
        recipientId: notification.recipientId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    notification: ApprovalNotification,
    recipient: NotificationRecipient
  ): Promise<void> {
    if (!this.emailTransporter || !recipient.email) {
      logger.warn('Email transporter not configured or recipient has no email', {
        recipientId: notification.recipientId,
      });
      return;
    }

    const template = this.getNotificationTemplate(notification.type);
    if (!template) {
      logger.warn('No template found for notification type', { type: notification.type });
      return;
    }

    // Render template with notification data
    const renderedTemplate = this.renderTemplate(template, notification, recipient);

    const mailOptions = {
      from: config.email.from || 'noreply@uaip.com',
      to: recipient.email,
      subject: renderedTemplate.subject,
      html: renderedTemplate.htmlBody,
      text: renderedTemplate.textBody,
    };

    await this.emailTransporter.sendMail(mailOptions);

    logger.info('Email notification sent', {
      recipientId: notification.recipientId,
      email: recipient.email,
      type: notification.type,
    });
  }

  /**
   * Send in-app notification
   */
  private async sendInAppNotification(
    notification: ApprovalNotification,
    _recipient: NotificationRecipient
  ): Promise<void> {
    // Store in-app notification in database
    const inAppNotification = {
      id: this.generateId(),
      userId: notification.recipientId,
      type: notification.type,
      title: this.getNotificationTitle(notification.type),
      message: this.getNotificationMessage(notification),
      data: {
        workflowId: notification.workflowId,
        operationId: notification.operationId,
        ...notification.metadata,
      },
      read: false,
      createdAt: new Date(),
    };

    // Save to database (assuming we have a notifications table)
    await this.saveInAppNotification(inAppNotification);

    // Send real-time notification via WebSocket/SSE
    await this.sendRealTimeNotification(notification.recipientId, inAppNotification);

    logger.info('In-app notification sent', {
      recipientId: notification.recipientId,
      type: notification.type,
      notificationId: inAppNotification.id,
    });
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    notification: ApprovalNotification,
    recipient: NotificationRecipient,
    webhookConfig: Record<string, unknown>
  ): Promise<void> {
    if (!webhookConfig.url) {
      logger.warn('Webhook URL not configured');
      return;
    }

    const payload = {
      type: notification.type,
      recipient: {
        id: recipient.id,
        email: recipient.email,
        name: recipient.name,
      },
      workflow: {
        id: notification.workflowId,
        operationId: notification.operationId,
      },
      metadata: notification.metadata,
      timestamp: new Date().toISOString(),
    };
    const response = await fetch(String(webhookConfig.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: String(webhookConfig.authHeader || ''),
        // @ts-expect-error -- Argument type mismatch
        'X-UAIP-Signature': this.generateWebhookSignature(payload, webhookConfig.secret),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new ExternalServiceError(`Webhook request failed: ${response.status} ${response.statusText}`);
    }

    logger.info('Webhook notification sent', {
      recipientId: notification.recipientId,
      webhookUrl: webhookConfig.url,
      status: response.status,
    });
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(
    notification: ApprovalNotification,
    recipient: NotificationRecipient,
    smsConfig: Record<string, unknown>
  ): Promise<void> {
    if (!recipient.phone || !smsConfig.provider) {
      logger.warn('SMS not configured or recipient has no phone', {
        recipientId: notification.recipientId,
      });
      return;
    }

    const message = this.getSMSMessage(notification);
    const provider = typeof smsConfig.provider === 'string' ? smsConfig.provider.toLowerCase() : '';

    logger.info('Sending SMS notification', {
      recipientId: notification.recipientId,
      phone: recipient.phone,
      provider,
    });

    try {
      if (provider === 'twilio') {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_FROM_NUMBER || String(smsConfig.from || '');

        if (!accountSid || !authToken || !fromNumber) {
          logger.warn(
            'Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)',
            {
              recipientId: notification.recipientId,
            }
          );
          return;
        }

        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const body = new URLSearchParams({ To: recipient.phone ?? '', From: fromNumber, Body: message });
        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new ExternalServiceError(`Twilio API error ${response.status}: ${errorText}`);
        }

        logger.info('SMS sent via Twilio', {
          recipientId: notification.recipientId,
          phone: recipient.phone,
        });
      } else if (provider === 'webhook' || smsConfig.webhookUrl) {
        const webhookUrl = String(smsConfig.webhookUrl || process.env.SMS_WEBHOOK_URL || '');
        if (!webhookUrl) {
          logger.warn('SMS webhook URL not configured', { recipientId: notification.recipientId });
          return;
        }
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipient.phone,
            message,
            recipientId: notification.recipientId,
          }),
        });

        if (!response.ok) {
          throw new ExternalServiceError(`SMS webhook error ${response.status}`);
        }

        logger.info('SMS sent via webhook', { recipientId: notification.recipientId });
      } else {
        logger.warn('Unknown SMS provider, message not sent', {
          provider,
          recipientId: notification.recipientId,
          supportedProviders: ['twilio', 'webhook'],
        });
      }
    } catch (error) {
      logger.error('Failed to send SMS notification', {
        recipientId: notification.recipientId,
        error,
      });
    }
  }

  /**
   * Get recipient details from database
   */
  private async getRecipientDetails(recipientId: string): Promise<unknown> {
    try {
      // This would query the users table
      // For now, return a mock recipient
      return {
        id: recipientId,
        email: `user-${recipientId}@example.com`,
        name: `User ${recipientId}`,
        phone: '+1234567890',
        preferences: {
          email: true,
          inApp: true,
          sms: false,
        },
      };
    } catch (error) {
      logger.error('Failed to get recipient details', {
        recipientId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get notification template
   */
  private getNotificationTemplate(type: string): NotificationTemplate | null {
    return this.templates.get(type) || null;
  }

  /**
   * Render template with data
   */
  private renderTemplate(
    template: NotificationTemplate,
    notification: ApprovalNotification,
    recipient: NotificationRecipient
  ): NotificationTemplate {
    const data = {
      recipientName: recipient.name,
      workflowId: notification.workflowId,
      operationId: notification.operationId,
      operationType: notification.metadata?.operationType || 'Unknown',
      securityLevel: notification.metadata?.securityLevel || 'Unknown',
      approvalUrl: `${config.frontend.baseUrl}/approvals/${notification.workflowId}`,
      ...notification.metadata,
    };

    return {
      subject: this.interpolateTemplate(template.subject, data),
      htmlBody: this.interpolateTemplate(template.htmlBody, data),
      textBody: this.interpolateTemplate(template.textBody, data),
    };
  }

  /**
   * Interpolate template with data
   */
  private interpolateTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match: string, key: string): string => {
      const value = data[key];
      return typeof value === 'string' ? value : match;
    });
  }

  /**
   * Get notification title
   */
  private getNotificationTitle(type: string): string {
    const titles: Record<string, string> = {
      approval_requested: 'Approval Required',
      approval_reminder: 'Approval Reminder',
      approval_completed: 'Approval Completed',
      approval_rejected: 'Approval Rejected',
      approval_expired: 'Approval Expired',
      approval_cancelled: 'Approval Cancelled',
    };

    return titles[type] || 'Notification';
  }

  /**
   * Get notification message
   */
  private getNotificationMessage(notification: ApprovalNotification): string {
    const messages: Record<string, string> = {
      approval_requested: `A new operation requires your approval: ${notification.metadata?.operationType || 'Unknown'}`,
      approval_reminder: `Reminder: Operation approval pending for ${notification.metadata?.operationType || 'Unknown'}`,
      approval_completed: `Operation has been approved: ${notification.metadata?.operationType || 'Unknown'}`,
      approval_rejected: `Operation has been rejected: ${notification.metadata?.operationType || 'Unknown'}`,
      approval_expired: `Approval request has expired: ${notification.metadata?.operationType || 'Unknown'}`,
      approval_cancelled: `Approval request has been cancelled: ${notification.metadata?.operationType || 'Unknown'}`,
    };

    return messages[notification.type] || 'You have a new notification';
  }

  /**
   * Get SMS message
   */
  private getSMSMessage(notification: ApprovalNotification): string {
    const operationType = notification.metadata?.operationType || 'Unknown';

    switch (notification.type) {
      case 'approval_requested':
        return `UAIP: Approval required for ${operationType}. Check your dashboard.`;
      case 'approval_reminder':
        return `UAIP: Reminder - Approval pending for ${operationType}.`;
      default:
        return `UAIP: Notification about ${operationType}.`;
    }
  }

  /**
   * Save in-app notification to database
   */
  private async saveInAppNotification(notification: InAppNotificationRecord): Promise<void> {
    logger.info('In-app notification saved', {
      notificationId: notification.id,
      userId: notification.userId,
    });
  }

  private async sendRealTimeNotification(userId: string, notification: InAppNotificationRecord): Promise<void> {
    logger.info('Real-time notification sent', {
      userId,
      notificationId: notification.id,
    });
  }

  /**
   * Generate webhook signature
   */
  private generateWebhookSignature(payload: unknown, secret?: string): string {
    if (!secret) return '';

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter(): void {
    try {
      if (config.email?.smtp) {
        this.emailTransporter = nodemailer.createTransport({
          host: config.email.smtp.host,
          port: config.email.smtp.port,
          secure: config.email.smtp.secure,
          auth: {
            user: config.email.smtp.user,
            pass: config.email.smtp.password,
          },
        });

        logger.info('Email transporter initialized');
      } else {
        logger.warn('Email SMTP configuration not found');
      }
    } catch (error) {
      logger.error('Failed to initialize email transporter', { error });
    }
  }

  /**
   * Load notification templates
   */
  private loadNotificationTemplates(): void {
    // Approval requested template
    this.templates.set('approval_requested', {
      subject: 'Approval Required: {{operationType}}',
      htmlBody: `
        <h2>Approval Required</h2>
        <p>Hello {{recipientName}},</p>
        <p>A new operation requires your approval:</p>
        <ul>
          <li><strong>Operation Type:</strong> {{operationType}}</li>
          <li><strong>Security Level:</strong> {{securityLevel}}</li>
          <li><strong>Operation ID:</strong> {{operationId}}</li>
        </ul>
        <p><a href="{{approvalUrl}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review and Approve</a></p>
        <p>Please review and provide your approval decision.</p>
        <p>Best regards,<br>UAIP Security Team</p>
      `,
      textBody: `
        Approval Required: {{operationType}}
        
        Hello {{recipientName}},
        
        A new operation requires your approval:
        - Operation Type: {{operationType}}
        - Security Level: {{securityLevel}}
        - Operation ID: {{operationId}}
        
        Please visit {{approvalUrl}} to review and provide your approval decision.
        
        Best regards,
        UAIP Security Team
      `,
    });

    // Approval reminder template
    this.templates.set('approval_reminder', {
      subject: 'Reminder: Approval Pending for {{operationType}}',
      htmlBody: `
        <h2>Approval Reminder</h2>
        <p>Hello {{recipientName}},</p>
        <p>This is a reminder that an operation is still pending your approval:</p>
        <ul>
          <li><strong>Operation Type:</strong> {{operationType}}</li>
          <li><strong>Security Level:</strong> {{securityLevel}}</li>
          <li><strong>Operation ID:</strong> {{operationId}}</li>
        </ul>
        <p><a href="{{approvalUrl}}" style="background-color: #ffc107; color: black; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review Now</a></p>
        <p>Please review and provide your approval decision as soon as possible.</p>
        <p>Best regards,<br>UAIP Security Team</p>
      `,
      textBody: `
        Reminder: Approval Pending for {{operationType}}
        
        Hello {{recipientName}},
        
        This is a reminder that an operation is still pending your approval:
        - Operation Type: {{operationType}}
        - Security Level: {{securityLevel}}
        - Operation ID: {{operationId}}
        
        Please visit {{approvalUrl}} to review and provide your approval decision.
        
        Best regards,
        UAIP Security Team
      `,
    });

    // Add more templates...
    this.templates.set('approval_completed', {
      subject: 'Approval Completed: {{operationType}}',
      htmlBody: `
        <h2>Approval Completed</h2>
        <p>Hello {{recipientName}},</p>
        <p>The approval workflow for the following operation has been completed:</p>
        <ul>
          <li><strong>Operation Type:</strong> {{operationType}}</li>
          <li><strong>Operation ID:</strong> {{operationId}}</li>
          <li><strong>Status:</strong> Approved</li>
        </ul>
        <p>The operation will now proceed to execution.</p>
        <p>Best regards,<br>UAIP Security Team</p>
      `,
      textBody: `
        Approval Completed: {{operationType}}
        
        Hello {{recipientName}},
        
        The approval workflow for the following operation has been completed:
        - Operation Type: {{operationType}}
        - Operation ID: {{operationId}}
        - Status: Approved
        
        The operation will now proceed to execution.
        
        Best regards,
        UAIP Security Team
      `,
    });

    logger.info('Notification templates loaded', {
      templateCount: this.templates.size,
    });
  }

  /**
   * Setup notification channels
   */
  private setupNotificationChannels(): void {
    this.channels = [
      {
        type: 'email',
        enabled: true,
        config: {},
      },
      {
        type: 'in_app',
        enabled: true,
        config: {},
      },
      {
        type: 'webhook',
        enabled: false,
        config: {
          url: config.notifications?.webhook?.url,
          secret: config.notifications?.webhook?.secret,
        },
      },
      {
        type: 'sms',
        enabled: false,
        config: {
          provider: config.notifications?.sms?.provider,
        },
      },
    ];

    logger.info('Notification channels configured', {
      enabledChannels: this.channels.filter((c) => c.enabled).map((c) => c.type),
    });
  }

  /**
   * Send general notification
   */
  public async sendNotification(notification: {
    type: string;
    recipient: string;
    subject: string;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    try {
      logger.info('Sending general notification', {
        type: notification.type,
        recipient: notification.recipient,
      });

      // Convert to approval notification format for compatibility
      const approvalNotification: ApprovalNotification = {
        type: notification.type,
        recipientId: notification.recipient,
        // @ts-expect-error -- Type not assignable
        workflowId: notification.data?.workflowId,
        // @ts-expect-error -- Type not assignable
        operationId: notification.data?.operationId,
        metadata: {
          subject: notification.subject,
          message: notification.message,
          ...notification.data,
        },
      };

      await this.sendApprovalNotification(approvalNotification);
    } catch (error) {
      logger.error('Failed to send general notification', {
        type: notification.type,
        recipient: notification.recipient,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
