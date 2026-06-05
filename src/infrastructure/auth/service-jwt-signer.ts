import jwt from "jsonwebtoken";

const { sign } = jwt;

export class ServiceJwtSigner {
  constructor(
    private readonly secret: string,
    private readonly caller: string,
  ) {}

  sign(audience: string): string {
    return sign({}, this.secret, {
      algorithm: "HS256",
      subject: `svc:${this.caller}`,
      audience,
      expiresIn: 300,
    });
  }
}
