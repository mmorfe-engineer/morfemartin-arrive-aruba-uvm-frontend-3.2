/* ============================================================
   ARRIVE ARUBA · Marketplace — e-actividad 3.1
   ------------------------------------------------------------
   js/historial.js · Lógica de la página "Mis pedidos"
   (realizado por Martin Alejandro Morfe Carballo)

   Lee los pedidos guardados en la base de datos del navegador
   (js/bd.js) y los dibuja en pantalla. Cada tarjeta trae su
   botón de eliminar. Se usa delegación de eventos: un solo
   "escuchador" en el contenedor atiende todos los botones,
   aunque los pedidos cambien.
   ============================================================ */

(function () {
  "use strict";

  var contenedor = document.getElementById("lista-pedidos");
  var contador = document.getElementById("contador-pedidos");

  /* ----------------------------------------------------------
     crearTarjeta(pedido) → nodo <article>
     Construye la tarjeta de un pedido usando createElement y
     textContent (nunca innerHTML con datos del usuario, para
     evitar inyección de HTML desde los campos del formulario).
     ---------------------------------------------------------- */
  function crearTarjeta(pedido) {
    var tarjeta = document.createElement("article");
    tarjeta.className = "pedido";
    tarjeta.setAttribute("data-id", pedido.id);

    /* Cabecera: prenda y fecha */
    var cabecera = document.createElement("header");
    cabecera.className = "pedido__cabecera";

    var nombre = document.createElement("h3");
    nombre.textContent = pedido.prenda;
    cabecera.appendChild(nombre);

    var fecha = document.createElement("p");
    fecha.className = "pedido__fecha";
    fecha.textContent = "Reservado el " + pedido.fecha;
    cabecera.appendChild(fecha);

    tarjeta.appendChild(cabecera);

    /* Detalles: descripción de la reserva */
    var lista = document.createElement("ul");
    lista.className = "pedido__detalles";

    [["Pasajero", pedido.nombre],
     ["Correo", pedido.email],
     ["Teléfono", pedido.telefono],
     ["Talla", pedido.talla],
     ["Cantidad", pedido.cantidad + " unidad(es)"],
     ["Notas", pedido.notas || "—"]
    ].forEach(function (par) {
      var item = document.createElement("li");
      var etiqueta = document.createElement("span");
      etiqueta.className = "pedido__etiqueta";
      etiqueta.textContent = par[0];
      var valor = document.createElement("strong");
      valor.textContent = par[1];
      item.appendChild(etiqueta);
      item.appendChild(valor);
      lista.appendChild(item);
    });

    tarjeta.appendChild(lista);

    /* Acción: eliminar pedido de la base de datos */
    var acciones = document.createElement("footer");
    acciones.className = "pedido__acciones";

    var boton = document.createElement("button");
    boton.type = "button";
    boton.className = "boton boton--secundario pedido__eliminar";
    boton.textContent = "Eliminar reserva";
    acciones.appendChild(boton);

    tarjeta.appendChild(acciones);
    return tarjeta;
  }

  /* ----------------------------------------------------------
     mostrarEstadoVacio()
     Cuando no hay pedidos: mensaje amable + enlace al
     formulario para que la página nunca se sienta rota.
     ---------------------------------------------------------- */
  function mostrarEstadoVacio() {
    contenedor.innerHTML = "";

    var vacio = document.createElement("div");
    vacio.className = "estado-vacio";

    var estrella = document.createElement("span");
    estrella.className = "estado-vacio__estrella";
    estrella.textContent = "✦";
    vacio.appendChild(estrella);

    var titulo = document.createElement("h3");
    titulo.textContent = "Todavía no hay reservas";
    vacio.appendChild(titulo);

    var texto = document.createElement("p");
    texto.textContent = "Cuando completes el formulario de reserva, tu pedido queda guardado aquí, en la base de datos de tu navegador.";
    vacio.appendChild(texto);

    var enlace = document.createElement("a");
    enlace.className = "boton boton--primario";
    enlace.href = "formulario.html";
    enlace.textContent = "Hacer la primera reserva";
    vacio.appendChild(enlace);

    contenedor.appendChild(vacio);
  }

  /* ----------------------------------------------------------
     renderizar()
     Pinta el estado completo de la base de datos en pantalla.
     ---------------------------------------------------------- */
  function renderizar() {
    var pedidos = BD.listar();

    if (contador) {
      contador.textContent = pedidos.length === 1
        ? "1 reserva guardada"
        : pedidos.length + " reservas guardadas";
    }

    if (pedidos.length === 0) {
      mostrarEstadoVacio();
      return;
    }

    contenedor.innerHTML = "";
    pedidos.forEach(function (pedido) {
      contenedor.appendChild(crearTarjeta(pedido));
    });
  }

  /* ----------------------------------------------------------
     Delegación de eventos: los botones de eliminar nacen y
     mueren con cada render, así que escucho al contenedor.
     ---------------------------------------------------------- */
  contenedor.addEventListener("click", function (evento) {
    var boton = evento.target.closest(".pedido__eliminar");
    if (!boton) return;

    var tarjeta = boton.closest(".pedido");
    if (tarjeta && confirm("¿Eliminar esta reserva de la base de datos?")) {
      BD.eliminar(tarjeta.getAttribute("data-id"));
      /* La tarjeta se desvanece antes de repintar la lista */
      tarjeta.classList.add("pedido--saliendo");
      tarjeta.addEventListener("transitionend", renderizar, { once: true });
    }
  });

  /* Primer dibujado al estar listo el DOM */
  document.addEventListener("DOMContentLoaded", renderizar);
})();
