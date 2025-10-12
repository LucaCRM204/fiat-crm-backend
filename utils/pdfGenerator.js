const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function generarPresupuestoPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4'
      });
      
      const fileName = `presupuesto_${data.cliente.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const tempDir = path.join(__dirname, '../temp');
      
      // Crear carpeta temp si no existe
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const filePath = path.join(tempDir, fileName);
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // === HEADER ===
      doc.fontSize(28)
         .fillColor('#D32F2F')
         .font('Helvetica-Bold')
         .text('PRESUPUESTO', { align: 'center' })
         .moveDown(0.5);

      doc.fontSize(10)
         .fillColor('#666666')
         .font('Helvetica')
         .text('GRUPO ALRA - FIAT', { align: 'center' })
         .moveDown(2);

      // === INFO DEL CLIENTE ===
      doc.fontSize(10)
         .fillColor('#000000')
         .font('Helvetica');

      const infoY = doc.y;
      doc.text(`Cliente: ${data.cliente}`, 50, infoY)
         .text(`Teléfono: ${data.telefono}`, 50, infoY + 15)
         .text(`Vendedor: ${data.vendedor}`, 300, infoY)
         .text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, 300, infoY + 15);

      doc.moveDown(2);

      // Línea separadora
      doc.moveTo(50, doc.y)
         .lineTo(550, doc.y)
         .strokeColor('#D32F2F')
         .lineWidth(2)
         .stroke();

      doc.moveDown(1);

      // === VEHÍCULO 0KM ===
      doc.fontSize(16)
         .fillColor('#D32F2F')
         .font('Helvetica-Bold')
         .text('🚗 VEHÍCULO 0KM', 50, doc.y)
         .moveDown(0.5);

      doc.fontSize(12)
         .fillColor('#000000')
         .font('Helvetica-Bold')
         .text(`Modelo: ${data.nombreVehiculo}`, 50, doc.y)
         .moveDown(0.3);

      doc.fontSize(14)
         .fillColor('#27AE60')
         .font('Helvetica-Bold')
         .text(`Valor Móvil: ${data.valorMinimo}`, 50, doc.y)
         .moveDown(1);

      // Anticipo
      if (data.anticipo) {
        doc.fontSize(11)
           .fillColor('#000000')
           .font('Helvetica')
           .text(`💰 Anticipo / Alicuota Extraordinaria: ${data.anticipo}`, 50, doc.y)
           .moveDown(0.5);
      }

      // Cuota 1
      if (data.bonificacionCuota) {
        doc.fontSize(11)
           .fillColor('#2980B9')
           .font('Helvetica-Bold')
           .text(`✨ Suscripción y Cuota 1: ${data.bonificacionCuota}`, 50, doc.y)
           .moveDown(0.5);
      }

      // === PLAN DE CUOTAS ===
      if (data.cuotas && data.cuotas.length > 0) {
        doc.moveDown(0.5);
        doc.fontSize(14)
           .fillColor('#D32F2F')
           .font('Helvetica-Bold')
           .text('💳 PLAN DE CUOTAS', 50, doc.y)
           .moveDown(0.5);
        
        doc.fontSize(11)
           .fillColor('#000000')
           .font('Helvetica');
        
        data.cuotas.forEach(cuota => {
          doc.text(`   • Cuotas ${cuota.cantidad}: ${cuota.valor}`, 50, doc.y)
             .moveDown(0.3);
        });
      }

      // Adjudicación
      if (data.adjudicacion) {
        doc.moveDown(0.5);
        doc.fontSize(11)
           .fillColor('#E67E22')
           .font('Helvetica-Bold')
           .text(`🎯 Adjudicación Asegurada: ${data.adjudicacion}`, 50, doc.y)
           .moveDown(1);
      }

      // === VEHÍCULO USADO ===
      if (data.marcaModelo) {
        doc.moveDown(1);
        
        // Línea separadora
        doc.moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .strokeColor('#CCCCCC')
           .lineWidth(1)
           .stroke();
        
        doc.moveDown(1);
        
        doc.fontSize(16)
           .fillColor('#8E44AD')
           .font('Helvetica-Bold')
           .text('🔄 COTIZACIÓN VEHÍCULO USADO', 50, doc.y)
           .moveDown(0.5);
        
        doc.fontSize(12)
           .fillColor('#000000')
           .font('Helvetica');
        
        doc.text(`Marca y Modelo: ${data.marcaModelo}`, 50, doc.y)
           .moveDown(0.3);
        
        if (data.anio) {
          doc.text(`Año: ${data.anio}`, 50, doc.y)
             .moveDown(0.3);
        }
        
        if (data.kilometros) {
          doc.text(`Kilómetros: ${data.kilometros}`, 50, doc.y)
             .moveDown(0.3);
        }
        
        if (data.valorEstimado) {
          doc.fontSize(13)
             .fillColor('#27AE60')
             .font('Helvetica-Bold')
             .text(`💵 Valor Estimado: ${data.valorEstimado}`, 50, doc.y)
             .moveDown(1);
        }
      }

      // === OBSERVACIONES ===
      if (data.observaciones) {
        doc.moveDown(1);
        doc.fontSize(14)
           .fillColor('#D32F2F')
           .font('Helvetica-Bold')
           .text('📋 OBSERVACIONES', 50, doc.y)
           .moveDown(0.5);
        
        doc.fontSize(10)
           .fillColor('#000000')
           .font('Helvetica')
           .text(data.observaciones, 50, doc.y, { 
             width: 500,
             align: 'justify'
           });
      }

      // === FOOTER ===
      doc.moveDown(2);
      
      // Caja de advertencia
      const warningY = doc.y;
      doc.rect(50, warningY, 500, 80)
         .fillColor('#FFF3CD')
         .fill();
      
      doc.rect(50, warningY, 500, 80)
         .strokeColor('#FFC107')
         .lineWidth(2)
         .stroke();
      
      doc.fontSize(12)
         .fillColor('#856404')
         .font('Helvetica-Bold')
         .text('⚠️ PROMOCIÓN VÁLIDA POR 72 HORAS', 60, warningY + 15, { width: 480, align: 'center' });
      
      doc.fontSize(9)
         .fillColor('#856404')
         .font('Helvetica')
         .text('Todas las bonificaciones especiales tendrán una vigencia de 72 horas', 60, warningY + 35, { width: 480, align: 'center' })
         .text('a partir de que te haya llegado este presupuesto.', 60, warningY + 50, { width: 480, align: 'center' });

      // Pie de página
      doc.fontSize(8)
         .fillColor('#999999')
         .font('Helvetica')
         .text('Consulte condiciones y requisitos con su vendedor.', 50, doc.page.height - 50, { 
           width: 500, 
           align: 'center' 
         });

      // Finalizar documento
      doc.end();

      writeStream.on('finish', () => {
        resolve(filePath);
      });

      writeStream.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generarPresupuestoPDF };