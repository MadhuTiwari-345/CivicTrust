import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

function getAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

export async function askMythBuster(question: string) {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({ 
      model: "gemini-2.0-flash",
      contents: question,
      config: {
        systemInstruction: "You are the CivicTrust AI Myth-Buster. Your job is to answer questions about the election process accurately, neutrally, and with source-backed confidence. Use a friendly, clear tone. Avoid political bias at all costs. Address common myths with facts from official sources (e.g., Election Commissions)."
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "The Myth-Buster is currently resting. Please check back later.";
  }
}
