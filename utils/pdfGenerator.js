const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Genera un PDF de presupuesto con formato profesional
 * @param {Object} data - Datos del presupuesto
 * @returns {Promise<string>} - Ruta del archivo PDF generado
 */
async function generarPresupuestoPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      // Crear directorio temporal si no existe
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Ruta del archivo temporal
      const fileName = `presupuesto_${Date.now()}.pdf`;
      const filePath = path.join(tempDir, fileName);

      // Crear documento PDF
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `Presupuesto - ${data.cliente}`,
          Author: 'Sistema de Gestión',
          Subject: 'Presupuesto de Vehículo'
        }
      });

      // Stream para escribir el archivo
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ENCABEZADO
      doc.fontSize(24)
         .fillColor('#2563eb')
         .text('PRESUPUESTO', { align: 'center' });

      doc.moveDown(0.5);
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Fecha: ${data.fecha || new Date().toLocaleDateString('es-AR')}`, { align: 'center' });
      
      if (data.vendedor) {
        doc.text(`Vendedor: ${data.vendedor}`, { align: 'center' });
      }

      doc.moveDown(1.5);

      // LÍNEA SEPARADORA
      doc.strokeColor('#2563eb')
         .lineWidth(2)
         .moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .stroke();

      doc.moveDown(1);

      // INFORMACIÓN DEL CLIENTE
      doc.fontSize(14)
         .fillColor('#1e40af')
         .text('DATOS DEL CLIENTE', { underline: true });
      
      doc.moveDown(0.5);
      doc.fontSize(11)
         .fillColor('#000000')
         .text(`Cliente: ${data.cliente || 'No especificado'}`, { continued: false });

      doc.moveDown(1.5);

      // INFORMACIÓN DEL VEHÍCULO
      doc.fontSize(14)
         .fillColor('#1e40af')
         .text('VEHÍCULO', { underline: true });
      
      doc.moveDown(0.5);
      doc.fontSize(12)
         .fillColor('#000000')
         .text(`${data.vehiculo?.marca || ''} ${data.vehiculo?.modelo || ''}`, { bold: true });
      
      if (data.vehiculo?.año) {
        doc.fontSize(11)
           .fillColor('#666666')
           .text(`Año: ${data.vehiculo.año}`);
      }

      doc.moveDown(1.5);

      // FINANCIACIÓN
      if (data.financiacion) {
        doc.fontSize(14)
           .fillColor('#1e40af')
           .text('FINANCIACIÓN EXCLUSIVA', { underline: true });
        
        doc.moveDown(0.5);

        // Precio de contado
        if (data.financiacion.precio_contado) {
          doc.fontSize(11)
             .fillColor('#000000')
             .text(`Valor de Mercado: ${data.financiacion.precio_contado}`);
          doc.moveDown(0.3);
        }

        // Anticipo
        if (data.financiacion.anticipo) {
          doc.fontSize(11)
             .fillColor('#000000')
             .text(`Anticipo / Mínimo Extraordinario: ${data.financiacion.anticipo}`);
          doc.moveDown(0.3);
        }

        // Bonificaciones
        if (data.financiacion.bonificaciones) {
          doc.fontSize(11)
             .fillColor('#16a34a')
             .text(`Bonificación y Cuota 0: ${data.financiacion.bonificaciones}`);
          doc.moveDown(0.5);
        }

        // Planes de cuotas
        if (data.financiacion.planes_cuotas) {
          doc.moveDown(0.5);
          doc.fontSize(12)
             .fillColor('#1e40af')
             .text('Planes de Pago:', { underline: true });
          
          doc.moveDown(0.3);

          const planes = data.financiacion.planes_cuotas;
          
          if (planes.cuota_2_12) {
            doc.fontSize(11)
               .fillColor('#000000')
               .text(`Cuota 2 a la 12: ${planes.cuota_2_12}`);
          }
          
          if (planes.cuota_13_84) {
            doc.fontSize(11)
               .fillColor('#000000')
               .text(`Cuota 13 a la 84: ${planes.cuota_13_84}`);
          }
          
          if (planes.ajuste_asumido) {
            doc.fontSize(10)
               .fillColor('#666666')
               .text(`Adjudicación Asumida: ${planes.ajuste_asumido}`);
          }
        }

        doc.moveDown(1.5);
      }

      // ESPECIFICACIONES TÉCNICAS
      if (data.especificaciones_tecnicas) {
        doc.fontSize(14)
           .fillColor('#1e40af')
           .text('ESPECIFICACIONES TÉCNICAS', { underline: true });
        
        doc.moveDown(0.5);
        doc.fontSize(10)
           .fillColor('#000000')
           .text(data.especificaciones_tecnicas, {
             align: 'justify',
             width: 495
           });
        
        doc.moveDown(1.5);
      }

      // OBSERVACIONES
      if (data.observaciones) {
        doc.fontSize(14)
           .fillColor('#1e40af')
           .text('OBSERVACIONES / NOTAS ADICIONALES', { underline: true });
        
        doc.moveDown(0.5);
        doc.fontSize(10)
           .fillColor('#000000')
           .text(data.observaciones, {
             align: 'justify',
             width: 495
           });
        
        doc.moveDown(1.5);
      }

      // DISCLAIMER
      const disclaimer = 'Todos los bonificaciones especiales tendrán una vigencia de 72 horas y serán válidos para el vehículo indicado en este presupuesto. No incluye IVA de bonos ni escrituración.';
      
      doc.addPage();
      doc.fontSize(12)
         .fillColor('#dc2626')
         .text('⚠️ IMPORTANTE', { underline: true });
      
      doc.moveDown(0.5);
      doc.fontSize(10)
         .fillColor('#000000')
         .text(disclaimer, {
           align: 'justify',
           width: 495
         });

      // PIE DE PÁGINA
      doc.moveDown(2);
      doc.fontSize(8)
         .fillColor('#999999')
         .text('Este documento es un presupuesto y no constituye un contrato vinculante.', {
           align: 'center'
         });
      
      doc.text('Para más información, contacte con nuestro equipo de ventas.', {
        align: 'center'
      });

      // Finalizar documento
      doc.end();

      // Esperar a que termine de escribir
      stream.on('finish', () => {
        console.log('✅ PDF generado exitosamente:', filePath);
        resolve(filePath);
      });

      stream.on('error', (err) => {
        console.error('❌ Error escribiendo PDF:', err);
        reject(err);
      });

    } catch (error) {
      console.error('❌ Error generando PDF:', error);
      reject(error);
    }
  });
}

module.exports = {
  generarPresupuestoPDF
};