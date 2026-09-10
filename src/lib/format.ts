export function formatDateTime(value?: Date | string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value?: Date | string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "long",
  }).format(new Date(value));
}

export function greetingForNow() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Günaydın";
  }

  if (hour < 18) {
    return "İyi günler";
  }

  return "İyi akşamlar";
}

export function formatNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("tr-TR").format(amount);
}

export function formatPercent(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return String(value);
  }

  return `${new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 2,
  }).format(amount)}%`;
}

export function formatMoney(
  value?: string | number | null,
  currency?: string | null,
  minorUnits = false,
) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value) / (minorUnits ? 100 : 1);

  if (Number.isNaN(amount)) {
    return String(value);
  }

  if (!currency) {
    return new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 2,
    }).format(amount);
  }

  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 2,
    }).format(amount)} ${currency}`;
  }
}

export function daysUntil(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
