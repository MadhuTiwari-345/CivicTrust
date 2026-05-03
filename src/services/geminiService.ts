export async function askMythBuster(question: string) {
  try {
    const response = await fetch("/api/mythbuster", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to fetch AI response");
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "The Myth-Buster is currently resting. Please check back later.";
  }
}
