import OpenAI from 'openai';
import { config } from '../config';
import { logger } from '../utils/logger';
import { platformAiPrompts } from '../prompts/platformPrompts';

const openai = config.openaiApiKey
  ? new OpenAI({ apiKey: config.openaiApiKey })
  : null;

const SYSTEM_PROMPT = platformAiPrompts.system;

class AIService {
  private fallbackResponse(messages: OpenAI.Chat.ChatCompletionMessageParam[]): string {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const prompt = typeof lastUser?.content === 'string' ? lastUser.content : 'your request';
    return `I can help you with that. Open Dashboard, Work Orders, Financial, Messages, and Map View to complete the task.\n\nSuggested next steps:\n1. Go to the relevant page for this request.\n2. Enter the required details and submit.\n3. Check Notifications and Messages for updates.\n\nRequest summary: ${prompt.substring(0, 280)}`;
  }

  private async complete(messages: OpenAI.Chat.ChatCompletionMessageParam[], max_tokens=1000): Promise<string> {
    if (!openai) return this.fallbackResponse(messages);
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens,
        temperature: 0.7,
      });
      return response.choices[0]?.message?.content ?? 'No response generated.';
    } catch (err) {
      logger.error('OpenAI API error:', err);
      return this.fallbackResponse(messages);
    }
  }

  async chat(messages: Array<{role:string;content:string}>, context?: any): Promise<string> {
    const contextMsg = context
      ? `Context: ${JSON.stringify(context)}\n\n`
      : '';
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(m => ({
      role: m.role as 'user'|'assistant',
      content: m.content,
    }));
    if (contextMsg && chatMessages.length > 0) {
      chatMessages[0].content = contextMsg + chatMessages[0].content;
    }
    return this.complete(chatMessages, 1500);
  }

  async summarize(text: string): Promise<string> {
    return this.complete([{ role:'user', content:`Summarize the following document concisely, highlighting key terms, obligations, and important dates:\n\n${text.substring(0,4000)}` }], 800);
  }

  async suggestWorkOrder(description: string, property?: any): Promise<any> {
    const propContext = property ? `Property: ${property.name} (${property.type}) in ${property.city}` : '';
    const response = await this.complete([{ role:'user', content:`${propContext}\nMaintenance issue: "${description}"\n\nProvide a JSON response with: priority (LOW/MEDIUM/HIGH/EMERGENCY), category (PLUMBING/ELECTRICAL/HVAC/GENERAL/CARPENTRY/PAINTING/CLEANING/LANDSCAPING/APPLIANCE/ROOFING/OTHER), estimatedCost (number in USD), suggestedTitle (string), suggestedDescription (string), recommendedContractorSpecialty (string). Return only valid JSON.` }], 600);
    try { return JSON.parse(response.replace(/```json\n?|\n?```/g,'')); }
    catch { return { priority:'MEDIUM', category:'GENERAL', estimatedCost:200, suggestedTitle:'Maintenance Request', suggestedDescription:description, recommendedContractorSpecialty:'General Contractor' }; }
  }

  async matchContractors(workOrder: any, contractors: any[]): Promise<any[]> {
    if (!contractors.length) return [];
    const contractorList = contractors.map((c,i) => `${i+1}. ${c.user.firstName} ${c.user.lastName} — specialties: ${(c.specialties||[]).join(', ')}, rating: ${c.rating??'N/A'}, rate: $${c.hourlyRate??'N/A'}/hr`).join('\n');
    const response = await this.complete([{ role:'user', content:`Work order: "${workOrder.title}" (${workOrder.category})\nAvailable contractors:\n${contractorList}\n\nRank the top 3 best matches as JSON array with fields: rank, contractorIndex (1-based), reasoning (brief string). Return only valid JSON array.` }], 500);
    try {
      const ranked: any[] = JSON.parse(response.replace(/```json\n?|\n?```/g,''));
      return ranked.map(r => ({ ...contractors[r.contractorIndex-1], matchReason: r.reasoning, rank: r.rank }));
    } catch { return contractors.slice(0,3); }
  }

  async generatePropertySummary(property: any): Promise<string> {
    return this.complete([{ role:'user', content:`Generate a professional property summary for:\nName: ${property.name}\nType: ${property.type}\nAddress: ${property.address}, ${property.city}, ${property.state}\nUnits: ${property._count?.units_rel??0}\nActive leases: ${property._count?.leases??0}\nOpen work orders: ${property._count?.workOrders??0}\n\nWrite 2-3 sentences suitable for an investor or manager overview.` }], 300);
  }

  async generatePortfolioReport(properties: any[], transactions: any[]): Promise<string> {
    const totalIncome  = transactions.filter(t=>t.type==='INCOME').reduce((s,t)=>s+t.amount,0);
    const totalExpense = transactions.filter(t=>t.type==='EXPENSE').reduce((s,t)=>s+t.amount,0);
    return this.complete([{ role:'user', content:`Portfolio report request:\nProperties: ${properties.length}\nTotal income YTD: $${totalIncome.toFixed(2)}\nTotal expenses YTD: $${totalExpense.toFixed(2)}\nNet income: $${(totalIncome-totalExpense).toFixed(2)}\n\nProvide a concise executive summary with performance insights and 3 actionable recommendations.` }], 1000);
  }
}

export const aiService = new AIService();
