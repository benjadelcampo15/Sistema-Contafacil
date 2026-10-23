# ContaFácil — Facturación electrónica ARCA para estudios contables

App web para que un contador emita facturas electrónicas de ARCA (ex AFIP) **en nombre de sus clientes**.
Cada cliente se conecta a ARCA con **su propio certificado**, que se configura desde su ficha.

## Modelo

```
Cuenta del estudio (email + contraseña)
 └── Clientes (CUIT, condición IVA, certificado ARCA propio, puntos de venta)
      ├── Sus clientes / compradores (agenda para no recargar datos)
      └── Comprobantes (Factura / NC / ND  A-B-C, con CAE y PDF con QR)
```

En cada llamada a WSFEv1 se usa el ticket WSAA del certificado del cliente y `Auth.Cuit` = CUIT del cliente.
(El código también soporta un certificado único del contador con delegación, como alternativa.)

## Puesta en marcha

```bash
cp .env.example .env        # completar DATABASE_URL y APP_SECRET (32+ caracteres)
npm install
npx prisma migrate deploy   # crea/actualiza las tablas
npm run dev                 # http://localhost:3001
```

`npm run smoke` prueba sin base de datos: conexión a ARCA homologación, firma CMS contra WSAA,
cálculo de totales y genera un PDF de ejemplo (`tmp-factura.pdf`).

## Conectar un cliente con ARCA (desde su ficha → "Conexión con ARCA")

1. **Certificado**: *Generar CSR* en la app → en ARCA, con la clave fiscal del cliente,
   *Administración de Certificados Digitales → Agregar alias* y subir el `.csr` → descargar el `.crt`
   → *Subir certificado* en la app.
2. **Autorización**: en ARCA, *Administrador de Relaciones → Nueva Relación → ARCA → WebServices →
   Facturación Electrónica* → Representante: *Computador Fiscal* (el alias) → *Probar conexión* en la app.
3. **Punto de venta**: en ARCA, *Administración de puntos de venta y domicilios → Agregar* con sistema
   "Factura Electrónica – Monotributo / RI – Web Services" → *Traer desde ARCA* en la app.

El ambiente (Producción / Homologación) se elige en *Configuración*.

## Cómo funciona la emisión

1. Se valida la letra (RI → A a RI/Monotributo, B al resto; Monotributo/Exento → C).
2. Se serializa por cliente + punto de venta + tipo, se pide `FECompUltimoAutorizado` y se usa el siguiente.
3. Se guarda el comprobante como `PENDIENTE` y se llama a `FECAESolicitar`.
   - Aprobado → `AUTORIZADO` con CAE, y se muestra el PDF.
   - Rechazado → se borra y se muestran los errores (el número no se consume en ARCA).
   - Sin respuesta → queda `PENDIENTE`; se resuelve con *Verificar en ARCA* (`FECompConsultar`).
4. Los tickets WSAA se cachean en la base (duran 12 h).

Las claves privadas se guardan cifradas (AES-256-GCM) con `APP_SECRET`: si se pierde ese valor, hay que
regenerar los certificados.

Los servidores de producción de ARCA usan DH de 1024 bits; las conexiones a ARCA bajan el nivel de
seguridad de OpenSSL solo para esos hosts (`src/lib/arca/soap.ts`).

## Estructura

| Ruta | Qué hay |
|---|---|
| `src/lib/arca/` | Cliente SOAP de WSAA y WSFEv1, tablas de códigos |
| `src/lib/facturacion.ts` | Tickets con cache, emisión, reconciliación de pendientes |
| `src/lib/totales.ts` | Cálculo de neto / IVA por alícuota (compartido con el form) |
| `src/lib/pdf.ts` | PDF con el formato de ARCA y QR (RG 4892) |
| `src/app/(app)/` | Clientes, emisión, comprobantes, configuración |

## Límites conocidos

- Solo moneda `PES`, sin tributos (percepciones) ni importes exentos/no gravados.
- El lock de numeración es en memoria: correr **una sola instancia** del servidor.
- El PDF no pagina: pensado para hasta ~35 ítems.
