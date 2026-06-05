/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import emailjs from '@emailjs/browser';
import { logger } from './logger';

// Initialize EmailJS with the user's public key
const PUBLIC_KEY = 'oomIlIXabG2D-NAXI';
emailjs.init(PUBLIC_KEY);

interface ResetEmailParams {
  name: string;
  user_email: string;
  reset_link: string;
  time: string;
}

export async function sendResetEmail(params: ResetEmailParams): Promise<boolean> {
  const serviceId = 'service_qgaubfd';
  const templateId = 'template_iax6959';

  logger.info(`Sending reset password link to user ${params.user_email}`, 'EmailJS');

  try {
    const result = await emailjs.send(serviceId, templateId, {
      name: params.name,
      user_email: params.user_email,
      reset_link: params.reset_link,
      time: params.time,
    });

    if (result.status === 200) {
      logger.success(`Reset link sent to ${params.user_email} successfully`, 'EmailJS');
      return true;
    } else {
      logger.warn(`EmailJS warning response logic: status code ${result.status}`, 'EmailJS', result);
      return false;
    }
  } catch (err) {
    logger.error(`Failed to send password reset email to ${params.user_email}`, 'EmailJS', err);
    throw err;
  }
}
