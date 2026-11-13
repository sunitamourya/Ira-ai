const PROVIDER_SLOTS = [1, 2, 3, 4];

function readProviders() {
  return PROVIDER_SLOTS
    .map(number => ({
      name: process.env[`AI_PROVIDER_${number}_NAME`],
      url: process.env[`AI_PROVIDER_${number}_URL`],
      key: process.env[`AI_PROVIDER_${number}_KEY`],
      model: process.env[`AI_PROVIDER_${number}_MODEL`]
    }))
    .filter(provider =>
      provider.url &&
      provider.key &&
      provider.model
    );
}

export function getConfiguredProviders() {
  return readProviders().map(provider => ({
    name: provider.name || "AI Provider",
    model: provider.model,
    configured: true
  }));
}

export async function generateAIResponse(messages) {
  const providers = readProviders();

  if (providers.length === 0) {
    throw new Error("No AI providers configured.");
  }

  const errors = [];

  for (const provider of providers) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      30000
    );

    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${provider.key}`
        },
        body: JSON.stringify({
          model: provider.model,
          messages
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(
          `${provider.name || provider.model}: HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (
        !data ||
        !data.choices?.[0]?.message?.content
      ) {
        throw new Error("Invalid provider response.");
      }

      return {
        data,
        provider: provider.name || provider.model
      };

    } catch (error) {
      errors.push(error.message);

      console.warn(
        `AI provider failed: ${provider.name || provider.model}`
      );

    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    "All configured AI providers failed: " +
    errors.join("; ")
  );
}
