# Email: Resend para lo interno, SES para marketing

## Reparto

- **Resend** (`lib/datos/email.ts`): avisos internos de la app (alertas, informes, fallos de ingesta).
- **Amazon SES** (`lib/marketing/enviar.ts`): campañas de email marketing.

## Variables de entorno

```
EMAIL_MARKETING_PROVIDER=ses        # ses | resend (si falta, decide por credenciales)
SES_SMTP_HOST=email-smtp.eu-west-1.amazonaws.com
SES_SMTP_PORT=465
SES_SMTP_USER=...
SES_SMTP_PASS=...
```

Si `EMAIL_MARKETING_PROVIDER` no se define, se usa SES cuando hay credenciales SMTP y Resend en caso contrario.

## Puesta en marcha de SES

1. Verificar el dominio en SES (DKIM + SPF + DMARC en el DNS).
2. Crear credenciales SMTP (IAM → usuario con `ses:SendEmail` → "Create SMTP credentials").
3. Pedir salida del sandbox (SES → Account dashboard → Request production access).
4. Configurar notificaciones de rebotes y quejas (SNS) y revisarlas periódicamente.

## Límites

- SES: 14 correos/segundo por defecto (se puede ampliar), sin tope diario.
- El envío se hace en grupos de 10 con reintentos por correo y registro individual en `campana_envios`.
