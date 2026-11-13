
const PROVIDER_SLOTS = [1, 2, 3, 4];

function readProviders() {
  return PROVIDER_SLOTS.map(number => {
    const prefix = `AI_PROVIDER_${number}_`;

    return {
      slot: number,
      name: process.env[prefix + "NAME"],
      url: process.env[prefix + "URL"],
      key: process.env[prefix + "KEY"],
      model: process.env[prefix + "MODEL"]
    };
  });
}

function getReadyProviders() {
  return readProviders().filter(provider =>
    provider.url?.trim() &&
    provider.key?.trim() &&
    provider.model?.trim()
  );
}

// Safe diagnostic: never returns API keys or URLs.
export function getConfiguredProviders() {
  return readProviders().map(provider => ({
    slot: provider.slot,
    namePresent: Boolean(provider.name?.trim()),
    urlPresent: Boolean(provider.url?.trim()),
    keyPresent: Boolean(provider.key?.trim()),
    modelPresent: Boolean(provider.model?.trim()),
    configured: Boolean(
      provider.url?.trim() &&
      provider.key?.trim() &&
      provider.model?.trim()
    )
  }));
}

export async function generateAIResponse(messages) {
  const providers = getReadyProviders();

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
        typeof data.choices?.[0]?.message?.content !== "string"
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
        `AI provider failed in slot ${provider.slot}.`
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
