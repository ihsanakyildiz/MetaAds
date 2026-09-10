import {
  getDecryptedAccessToken,
  getDecryptedMetaConfig,
} from "@/lib/meta";

const DEFAULT_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v22.0";

type GraphError = {
  error?: {
    message?: string;
  };
};

export async function pauseMetaAdSet(metaAdSetId: string) {
  const config = await getDecryptedMetaConfig();
  const tokenData = await getDecryptedAccessToken();

  if (!config || !tokenData) {
    throw new Error("Meta bağlantısı bulunamadı.");
  }

  const version = config.graphVersion || DEFAULT_GRAPH_VERSION;
  const response = await fetch(
    `https://graph.facebook.com/${version}/${metaAdSetId}`,
    {
      method: "POST",
      body: new URLSearchParams({
        status: "PAUSED",
        access_token: tokenData.accessToken,
      }),
      cache: "no-store",
    },
  );
  const data = (await response.json()) as { success?: boolean } & GraphError;

  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message ?? "Reklam seti Meta'da durdurulamadı.",
    );
  }
}
