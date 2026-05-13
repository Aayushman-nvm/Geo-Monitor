import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function getThreatSummary(content: string) {
  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `Use ${content} as your context and generate an extremely small yet informative summary of the threat with essential analytical data in the context, make sure the summary isnt more than 2 lines`,
      },
    ],
    model: "llama-3.1-8b-instant",
  });

  const res = chatCompletion.choices[0]?.message?.content || "";
  console.log(res);
  return res;
}
