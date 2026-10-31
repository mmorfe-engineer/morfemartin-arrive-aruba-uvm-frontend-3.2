/* ============================================================
   ARRIVE ARUBA · Marketplace — e-actividad 3.1
   ------------------------------------------------------------
   js/formulario.js · Validación y guardado de la reserva
   (realizado por Martin Morfe Flores.°.)

   1) Al cargar: si la URL trae ?prenda=… (enlaces desde la
      ficha del producto o el catálogo), se preselecciona esa
      prenda en el selector.
   2) Al enviar: se valida campo por campo sin recargar la
      página; los errores se muestran junto a cada campo.
   3) Si todo pasa: la reserva se guarda con BD.guardar(...)
      y se muestra el mensaje de éxito con enlace a Mis pedidos.
   ============================================================ */

(function () {
  "use strict";

  var formulario = document.getElementById("formulario-reserva");
  var mensajeExito = document.getElementById("mensaje-exito");

  /* ----------------------------------------------------------
     Precarga de la prenda desde la URL (?prenda=…)
     ---------------------------------------------------------- */
  function precargarPrenda() {
    var parametros = new URLSearchParams(window.location.search);
    var prenda = parametros.get("prenda");
    if (!prenda) return;

    var selector = document.getElementById("campo-prenda");
    var opcion = Array.prototype.find.call(selector.options, function (o) {
      return o.text === prenda;
    });
    if (opcion) selector.value = opcion.value || opcion.text;
  }

  /* ----------------------------------------------------------
     Utilidades de validación
     ---------------------------------------------------------- */

  /* Marca el campo como inválido (muestra su mensaje de error) */
  function marcarInvalido(idEnvoltura) {
    document.getElementById(idEnvoltura).classList.add("campo--invalido");
  }

  /* Limpia el estado de error de todo el formulario */
  function limpiarErrores() {
    var invalidos = formulario.querySelectorAll(".campo--invalido");
    Array.prototype.forEach.call(invalidos, function (campo) {
      campo.classList.remove("campo--invalido");
    });
  }

  /* Reglas por campo: devuelven true si el valor es aceptable */
  function esCorreoValido(valor) {
    /* Patrón simple y suficiente para el alcance académico:
       texto@texto.dominio */
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
  }

  function esTelefonoValido(valor) {
    /* Se cuentan solo los dígitos: +58 412 1234567 → 11 */
    var digitos = valor.replace(/\D/g, "");
    return digitos.length >= 7;
  }

  /* ----------------------------------------------------------
     Validación completa del formulario
     ---------------------------------------------------------- */
  function validar() {
    var ok = true;
    limpiarErrores();

    /* Nombre: obligatorio, con nombre y apellido */
    var nombre = document.getElementById("campo-nombre").value.trim();
    if (nombre.length < 3 || nombre.indexOf(" ") === -1) {
      marcarInvalido("campo-nombre-envoltura");
      ok = false;
    }

    /* Correo: obligatorio y con formato válido */
    var email = document.getElementById("campo-email").value.trim();
    if (!esCorreoValido(email)) {
      marcarInvalido("campo-email-envoltura");
      ok = false;
    }

    /* Teléfono: obligatorio y con suficientes dígitos */
    var telefono = document.getElementById("campo-telefono").value.trim();
    if (!esTelefonoValido(telefono)) {
      marcarInvalido("campo-telefono-envoltura");
      ok = false;
    }

    /* Prenda: alguna opción elegida */
    var prenda = document.getElementById("campo-prenda").value;
    if (!prenda) {
      marcarInvalido("campo-prenda-envoltura");
      ok = false;
    }

    /* Talla: algún radio marcado */
    var talla = formulario.querySelector('input[name="talla"]:checked');
    if (!talla) {
      marcarInvalido("campo-talla-envoltura");
      ok = false;
    }

    /* Cantidad: entero entre 1 y 10 */
    var cantidad = Number(document.getElementById("campo-cantidad").value);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10) {
      marcarInvalido("campo-cantidad-envoltura");
      ok = false;
    }

    return ok ? { prenda: prenda, talla: talla.value, cantidad: cantidad } : null;
  }

  /* ----------------------------------------------------------
     Envío: validar → guardar en la base de datos → avisar
     ---------------------------------------------------------- */
  formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();   /* nunca recargamos la página */

    var datos = validar();
    if (!datos) {
      /* Lleva el foco al primer campo con error */
      var primero = formulario.querySelector(".campo--invalido .campo__entrada, .campo--invalido .campo__selector");
      if (primero) primero.focus();
      return;
    }

    BD.guardar({
      prenda: datos.prenda,
      talla: datos.talla,
      cantidad: datos.cantidad,
      nombre: document.getElementById("campo-nombre").value.trim(),
      email: document.getElementById("campo-email").value.trim(),
      telefono: document.getElementById("campo-telefono").value.trim(),
      notas: document.getElementById("campo-notas").value.trim()
    });

    /* Confirmación visible + formulario limpio para la próxima reserva */
    formulario.reset();
    mensajeExito.hidden = false;
    mensajeExito.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  /* Al escribir en un campo, su error desaparece de inmediato */
  formulario.addEventListener("input", function (evento) {
    var envoltura = evento.target.closest(".campo");
    if (envoltura) envoltura.classList.remove("campo--invalido");
  });

  /* Precarga inicial */
  document.addEventListener("DOMContentLoaded", precargarPrenda);
})();
