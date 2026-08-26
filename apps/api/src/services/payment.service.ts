import Stripe from 'stripe';
import { config } from '../config';
import { logger } from '../utils/logger';
import { prisma } from '../index';
import { Request } from 'express';

const stripe: Stripe | null = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' })
  : null;

class PaymentService {
  async createPaymentIntent(amount: number, currency='usd', metadata: Record<string,string>={}): Promise<Stripe.PaymentIntent> {
    if (!stripe) throw new Error('Stripe is not configured');
    return stripe.paymentIntents.create({ amount: Math.round(amount*100), currency, metadata, automatic_payment_methods: { enabled: true } });
  }

  async handleWebhook(req: Request): Promise<void> {
    if (!stripe) { logger.warn('Stripe webhook received but Stripe not configured'); return; }
    const sig = req.headers['stripe-signature'] as string;
    if (!sig || !config.stripe.webhookSecret) return;
    let event: Stripe.Event;
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
      event = stripe.webhooks.constructEvent(rawBody, sig, config.stripe.webhookSecret);
    } catch (err) {
      logger.error('Stripe webhook signature verification failed:', err);
      return;
    }
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const txId = pi.metadata?.transactionId;
        if (txId) {
          await prisma.transaction.update({ where:{ id:txId }, data:{ status:'COMPLETED', paidAt:new Date(), stripeId: pi.id } }).catch(logger.error);
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const txId = pi.metadata?.transactionId;
        if (txId) {
          await prisma.transaction.update({ where:{ id:txId }, data:{ status:'FAILED' } }).catch(logger.error);
        }
        break;
      }
      default:
        logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }
}

export const paymentService = new PaymentService();
