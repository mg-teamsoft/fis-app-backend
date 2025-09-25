import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret");

export class JwtUtil {
  static async extractUser(req: any): Promise<{ userId: string; fullname: string }> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return { userId: "", fullname: "Kullanıcı" };
      }

      const token = authHeader.split(" ")[1];
      const { payload } = await jwtVerify(token, JWT_SECRET);

      // Map from standard JWT claims
      const userId = (payload.sub as string) || "anonymous";
      const fullname = (payload.name as string) || "Kullanıcı";

      return { userId, fullname };
    } catch (err) {
      console.error("JWT parse error:", err);
      return { userId: "", fullname: "Kullanıcı" };
    }
  }
}