import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import { decryptSensitive, encryptSensitive, getEncryptionKeyVersion } from "@/lib/security/encryption";

export async function rotateWhatsappSessionEncryption(businessId?: string) {
  const db = await getDb();
  const query = businessId && ObjectId.isValid(businessId)
    ? { businessId: new ObjectId(businessId) }
    : {};

  const sessions = await db.collection("whatsapp_sessions").find(query).toArray();
  let rotated = 0;

  for (const session of sessions) {
    const rec = session as Record<string, unknown>;
    const plainPhone = String(rec.phoneNumber || decryptSensitive(String(rec.phoneNumberEncrypted || "")) || "");
    const plainInstance = String(rec.instanceName || decryptSensitive(String(rec.instanceNameEncrypted || "")) || "");

    const encryptedPhone = plainPhone ? encryptSensitive(plainPhone) : null;
    const encryptedInstance = plainInstance ? encryptSensitive(plainInstance) : null;

    await db.collection("whatsapp_sessions").updateOne(
      { _id: session._id },
      {
        $set: {
          phoneNumberEncrypted: encryptedPhone,
          instanceNameEncrypted: encryptedInstance,
          encryptionKeyVersion: getEncryptionKeyVersion(),
          updatedAt: new Date(),
        },
      },
    );
    rotated += 1;
  }

  return { rotated, keyVersion: getEncryptionKeyVersion() };
}
