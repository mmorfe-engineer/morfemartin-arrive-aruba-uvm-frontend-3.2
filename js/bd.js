/* ============================================================
   ARRIVE ARUBA · Marketplace — e-actividad 3.1
   ------------------------------------------------------------
   js/bd.js · Módulo de base de datos del navegador
   (realizado por Martin Alejandro Morfe Carballo)

   La actividad exige utilizar una base de datos. Al ser un
   sitio estático de HTML/CSS sin servidor, se implementa con
   la Web Storage API (localStorage), que funciona como base de
   datos persistente del navegador: sobrevive recargas y
   cierres de la pestaña.

   CONTRATO DEL REGISTRO DE PEDIDO
   ------------------------------------
   BD.guardar(pedido) espera un objeto con esta forma:

     {
       prenda:   "Camisa Sunset Wharf",   // nombre de la prenda
       talla:    "M",                     // talla elegida
       cantidad: 1,                       // unidades reservadas
       nombre:   "Ana Pérez",             // quien reserva
       email:    "ana@correo.com",
       telefono: "+58 412 0000000",
       notas:    "Recoger en el muelle"    // opcional
     }

   El módulo agrega por su cuenta: id (identificador único)
   y fecha (momento de la reserva, en formato local).
   ============================================================ */

/* Se usa un objeto global y no módulos ES para que la página
   también funcione abierta directamente desde el archivo
   (file://), sin servidor local. */
window.BD = (function () {
  "use strict";

  /* Clave única bajo la que viven los pedidos dentro de
     localStorage. Prefijo de marca para no chocar con otros
     sitios guardados en el mismo navegador. */
  var CLAVE = "arrive-aruba-pedidos";

  /* ----------------------------------------------------------
     leerTodo (interno)
     Devuelve el arreglo de pedidos guardados. Si el navegador
     nunca guardó nada (o el JSON se corrompió), devuelve un
     arreglo vacío en lugar de fallar.
     ---------------------------------------------------------- */
  function leerTodo() {
    try {
      var crudo = localStorage.getItem(CLAVE);
      if (!crudo) return [];
      var datos = JSON.parse(crudo);
      return Array.isArray(datos) ? datos : [];
    } catch (error) {
      /* JSON inválido: mejor empezar limpio que romper la página */
      console.warn("La base de datos local estaba dañada y se reinició.", error);
      return [];
    }
  }

  /* ----------------------------------------------------------
     escribirTodo (interno)
     Reemplaza el contenido completo de la base de datos.
     ---------------------------------------------------------- */
  function escribirTodo(pedidos) {
    localStorage.setItem(CLAVE, JSON.stringify(pedidos));
  }

  /* ----------------------------------------------------------
     generarId (interno)
     Identificador prácticamente único: marca de tiempo en
     milisegundos + un número aleatorio. Suficiente para un
     carrito académico (no se usa en producción con concurrencia).
     ---------------------------------------------------------- */
  function generarId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  /* ----------------------------------------------------------
     BD.listar()
     Devuelve todos los pedidos, del más reciente al más viejo.
     ---------------------------------------------------------- */
  function listar() {
    return leerTodo().sort(function (a, b) {
      return new Date(b.fechaISO) - new Date(a.fechaISO);
    });
  }

  /* ----------------------------------------------------------
     BD.guardar(pedido)
     Agrega un pedido nuevo con id y fecha, y devuelve el
     pedido completo tal como quedó guardado.
     ---------------------------------------------------------- */
  function guardar(pedido) {
    var pedidos = leerTodo();

    var registro = {
      id: generarId(),
      fechaISO: new Date().toISOString(),
      fecha: new Date().toLocaleString("es-VE", {
        dateStyle: "medium",
        timeStyle: "short"
      }),
      prenda: pedido.prenda,
      talla: pedido.talla,
      cantidad: Number(pedido.cantidad) || 1,
      nombre: pedido.nombre,
      email: pedido.email,
      telefono: pedido.telefono,
      notas: pedido.notas || ""
    };

    pedidos.push(registro);
    escribirTodo(pedidos);
    return registro;
  }

  /* ----------------------------------------------------------
     BD.eliminar(id)
     Quita de la base de datos el pedido con ese id.
     ---------------------------------------------------------- */
  function eliminar(id) {
    var restantes = leerTodo().filter(function (p) {
      return p.id !== id;
    });
    escribirTodo(restantes);
  }

  /* ----------------------------------------------------------
     BD.total()
     Cantidad de pedidos guardados (para avisos en la interfaz).
     ---------------------------------------------------------- */
  function total() {
    return leerTodo().length;
  }

  /* API pública del módulo */
  return {
    listar: listar,
    guardar: guardar,
    eliminar: eliminar,
    total: total
  };
})();
