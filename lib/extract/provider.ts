export function currentLlmProvider(): "mock" | "openai" {
  return (process.env.LLM_PROVIDER || "mock").toLowerCase() === "openai" ? "openai" : "mock";
}
