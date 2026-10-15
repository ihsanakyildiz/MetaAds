function errorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    return String(error.code);
  }

  return "";
}

function errorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function dbErrorMessage(error: unknown) {
  const code = errorCode(error);
  const message = errorText(error);

  if (
    code === "P1001" ||
    message.includes("Can't reach database") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND")
  ) {
    return "Veritabanına bağlanılamadı. AiroApp barındırılan MySQL (DB_HOST) veya mevcut sunucudaki DATABASE_URL değerini kontrol edin.";
  }

  if (
    code === "P1000" ||
    message.includes("Access denied") ||
    message.includes("Authentication failed")
  ) {
    return "Veritabanı kullanıcı adı veya şifresi hatalı. DATABASE_URL içindeki bilgileri kontrol edin.";
  }

  if (code === "P1003" || message.includes("Unknown database")) {
    return "DATABASE_URL içindeki veritabanı adı bulunamadı. Barındırılan MySQL’de şemayı oluşturup bağlantı dizesini güncelleyin.";
  }

  if (
    code === "P2021" ||
    message.includes("does not exist") ||
    message.includes("Unknown table")
  ) {
    return "Veritabanı tabloları eksik. SQL’i MySQL’e içe aktarın veya npx prisma db push ve npm run db:seed çalıştırın.";
  }

  if (message.includes("DATABASE_URL")) {
    return "Veritabanı bağlantısı okunamadı. AiroApp barındırılan MySQL’i ekleyin (DB_HOST otomatik gelir) veya diğer sunucularda DATABASE_URL tanımlayın.";
  }

  if (message.includes("SESSION_SECRET")) {
    return "SESSION_SECRET tanımlı değil. .env içine en az 32 karakterlik bir değer ekleyin.";
  }

  return "Giriş sırasında sunucu hatası oluştu. Veritabanı bağlantısını ve kullanıcı kaydını kontrol edin.";
}
