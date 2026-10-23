"use client";

import { useActionState, type ReactNode } from "react";
import { Mensaje } from "@/components/mensaje";
import { generarCsrCliente, probarConexionCliente, subirCertificadoCliente, type CertState } from "../actions";

/** Guía paso a paso para conectar un cliente con ARCA usando su propio certificado. */
export function ConexionArca(props: {
  clienteId: string;
  razonSocial: string;
  tieneClave: boolean;
  cert: { alias?: string; vence: string } | null;
  puntosVenta: number;
  verificado: string | null;
}) {
  const [csrState, csrAction, generando] = useActionState<CertState>(generarCsrCliente.bind(null, props.clienteId), {});
  const [subirState, subirAction, subiendo] = useActionState<CertState, FormData>(
    subirCertificadoCliente.bind(null, props.clienteId),
    {},
  );
  const [probarState, probarAction, probando] = useActionState<CertState>(
    probarConexionCliente.bind(null, props.clienteId),
    {},
  );

  const descargar = () => {
    if (!csrState.csr) return;
    const url = URL.createObjectURL(new Blob([csrState.csr], { type: "application/pkcs10" }));
    Object.assign(document.createElement("a"), { href: url, download: `${props.razonSocial.replace(/\W+/g, "-")}.csr` }).click();
    URL.revokeObjectURL(url);
  };

  const tieneCert = Boolean(props.cert);
  const lista = tieneCert && Boolean(props.verificado) && props.puntosVenta > 0;

  return (
    <div className="space-y-5 text-sm">
      <p
        className={`rounded-md px-3 py-2 font-medium ${lista ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}
      >
        {lista ? "✓ Lista para facturar" : "Faltan pasos para poder facturar"}
      </p>

      <Paso n={1} hecho={tieneCert} titulo="Certificado digital">
        {tieneCert ? (
          <p className="text-slate-600">
            Cargado — alias <strong>{props.cert!.alias}</strong>, vence {props.cert!.vence}.
          </p>
        ) : (
          <ol className="list-[lower-alpha] space-y-3 pl-5 text-slate-700">
            <li>
              <div className="flex flex-wrap items-center gap-3">
                <span>Generá el pedido de certificado:</span>
                <form
                  action={csrAction}
                  onSubmit={(e) => {
                    if (props.tieneClave && !confirm("Ya se generó una clave para este cliente. Si generás otra, el CSR anterior deja de servir. ¿Seguir?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  <button className="btn-secondary" disabled={generando}>Generar CSR</button>
                </form>
                {csrState.csr && <button type="button" className="btn" onClick={descargar}>Descargar CSR</button>}
                <Mensaje state={csrState} />
              </div>
            </li>
            <li>
              En ARCA, <strong>con la clave fiscal de {props.razonSocial}</strong>: <em>Administración de Certificados
              Digitales → Agregar alias</em> (por ejemplo <code>contafacil</code>) → subí el CSR → entrá al alias y
              descargá el certificado (.crt). Si Windows pregunta si abrirlo, tocá <em>Cancelar</em>.
            </li>
            <li>
              <form action={subirAction} className="flex flex-wrap items-center gap-3">
                <span>Subí el .crt:</span>
                <input className="input max-w-xs" name="cert" type="file" accept=".crt,.pem,.cer" />
                <button className="btn" disabled={subiendo}>Subir certificado</button>
                <Mensaje state={subirState} />
              </form>
            </li>
          </ol>
        )}
      </Paso>

      <Paso n={2} hecho={Boolean(props.verificado)} titulo="Autorizar la facturación electrónica">
        <p className="text-slate-700">
          En ARCA, con la clave de {props.razonSocial}: <em>Administrador de Relaciones → Nueva Relación → Buscar →
          ARCA → WebServices → Facturación Electrónica</em> → Representante: <em>Computador Fiscal</em> → el alias del
          paso 1 → Confirmar.
        </p>
        {props.verificado && <p className="mt-2 text-green-700">✓ Conexión verificada el {props.verificado}.</p>}
        <form action={probarAction} className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-secondary" disabled={probando || !tieneCert}>
            {probando ? "Probando…" : "Probar conexión"}
          </button>
          <Mensaje state={probarState} />
        </form>
      </Paso>

      <Paso n={3} hecho={props.puntosVenta > 0} titulo="Punto de venta Web Services">
        {props.puntosVenta > 0 ? (
          <p className="text-slate-600">{props.puntosVenta} punto(s) de venta cargado(s) — ver abajo.</p>
        ) : (
          <p className="text-slate-700">
            En ARCA: <em>Administración de puntos de venta y domicilios → A/B/M de Puntos de venta → Agregar</em> →
            un número nuevo, sistema <em>&quot;Factura Electrónica – Monotributo / RI – Web Services&quot;</em>. El de
            &quot;Factura en línea&quot; no sirve. Después tocá <em>Traer desde ARCA</em> en la sección de abajo.
          </p>
        )}
      </Paso>
    </div>
  );
}

function Paso(props: { n: number; titulo: string; hecho: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          props.hecho ? "bg-green-600 text-white" : "bg-slate-200 text-slate-700"
        }`}
      >
        {props.hecho ? "✓" : props.n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 font-medium text-slate-900">{props.titulo}</p>
        {props.children}
      </div>
    </div>
  );
}
