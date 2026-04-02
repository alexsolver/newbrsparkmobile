export type LLMProvider = 'openai' | 'gemini';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `Você é o Consultor AI do BrSpark — um assistente especializado em gestão de bens e propriedades.

Seu papel:
- Analisar dados de bens (imóveis, veículos, propriedades)
- Dar recomendações sobre seguros, custos, manutenção e estoque
- Responder perguntas sobre o contexto do bem fornecido
- Falar sempre em português brasileiro
- Ser direto, prático e usar dados quando disponíveis
- Formatar respostas de forma concisa e clara

Regras:
- Nunca invente dados que não foram fornecidos no contexto
- Se não souber, diga que precisa de mais informações
- Sugira ações práticas quando possível
- Use emojis com moderação para clareza visual`;

export const LLMService = {
  async getConfig(): Promise<{ apiKey: string | null; provider: LLMProvider; isPremium: boolean }> {
    return {
      apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || null,
      provider: 'openai',
      isPremium: true,
    };
  },

  async chat(
    messages: ChatMessage[],
    assetContext: string,
  ): Promise<string> {
    const { apiKey, provider } = await this.getConfig();

    if (!apiKey) {
      throw new Error('API key não configurada. Configure nas preferências do Consultor AI.');
    }

    const systemMessage: ChatMessage = {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\n--- CONTEXTO DO BEM ---\n${assetContext}`,
    };

    const fullMessages = [systemMessage, ...messages];

    if (provider === 'gemini') {
      return this.chatGemini(apiKey, fullMessages);
    }
    return this.chatOpenAI(apiKey, fullMessages);
  },

  async chatOpenAI(apiKey: string, messages: ChatMessage[]): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 401) throw new Error('API key inválida. Verifique sua chave OpenAI.');
      if (response.status === 429) throw new Error('Limite de requisições atingido. Tente novamente em alguns segundos.');
      throw new Error(`Erro OpenAI (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Sem resposta do modelo.';
  },

  async chatGemini(apiKey: string, messages: ChatMessage[]): Promise<string> {
    // Convert to Gemini format
    const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 400) throw new Error('API key Gemini inválida ou formato incorreto.');
      throw new Error(`Erro Gemini (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta do modelo.';
  },
};
