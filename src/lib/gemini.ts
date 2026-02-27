import { GoogleGenAI } from "@google/genai";

export const summarizeArticle = async (content: string, apiKey: string) => {
  if (!apiKey) throw new Error("Gemini API Key is required");
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Truncate content if it's too long to avoid token limits (naive approach)
  // A better approach would be to parse the HTML and extract text only, but for now:
  const cleanContent = content.replace(/<[^>]*>?/gm, '').slice(0, 30000); 

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are a helpful assistant. Please summarize the following WeChat article content. 
    Focus on the key points and insights. 
    
    Content:
    ${cleanContent}`,
  });

  return response.text;
};
