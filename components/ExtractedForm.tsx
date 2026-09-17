import type { SettlementForm } from "@/lib/schema";
import { formatMoney } from "@/lib/present";

export function ExtractedForm({ settlement }: { settlement: SettlementForm }) {
  const isSettlement = settlement.documentType === "settlement" || settlement.settlementLineItems.length > 0;
  const rows: Array<[string, string]> = [
    ["Document type", settlement.documentType ?? "—"],
    ["Document number", settlement.documentNumber ?? "—"],
    ["Supplier", settlement.supplierName ?? "—"],
    ["Supplier ID", settlement.supplierId ?? "—"],
    ["Tax ID", settlement.supplierTaxId ?? "—"],
    ["Customer", settlement.customerName ?? "—"],
    ["Document date", settlement.documentDate ?? "—"],
    [
      "Service period",
      settlement.servicePeriodStart || settlement.servicePeriodEnd
        ? `מ-${settlement.servicePeriodStart ?? "—"} עד ${settlement.servicePeriodEnd ?? "—"}`
        : "—",
    ],
    ["Purchase order", settlement.purchaseOrderNumber ?? "—"],
    ["Contract", settlement.contractNumber ?? "—"],
    ["Allocation #", settlement.allocationNumber ?? "—"],
    ["Currency", settlement.currency ?? "—"],
  ];
  if (isSettlement) {
    rows.push(
      ["Total charges", formatMoney(settlement.totalCharges, settlement.currency ?? "ILS")],
      ["Total payments", formatMoney(settlement.totalPayments, settlement.currency ?? "ILS")],
      ["Outstanding", formatMoney(settlement.outstandingBalance, settlement.currency ?? "ILS")],
    );
  } else {
    rows.push(
      ["Subtotal", formatMoney(settlement.subtotal, settlement.currency ?? "ILS")],
      ["VAT rate", settlement.vatRate === null ? "—" : `${Math.round(settlement.vatRate * 1000) / 10}%`],
      ["VAT", formatMoney(settlement.vatAmount, settlement.currency ?? "ILS")],
      ["Total", formatMoney(settlement.totalAmount, settlement.currency ?? "ILS")],
    );
  }
  rows.push(["Payment terms", settlement.paymentTerms ?? "—"], ["Due date", settlement.dueDate ?? "—"]);
  if (settlement.notes) rows.push(["Notes", settlement.notes]);

  return (
    <div>
      <table className="w-full text-right text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-stone-100">
              <td className="py-2 text-stone-500">{label}</td>
              <td className="font-medium" dir="auto">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {settlement.settlementLineItems.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium">Settlement lines</div>
          <table className="w-full text-right text-sm">
            <thead className="text-stone-500">
              <tr>
                <th className="py-1">Date</th>
                <th>Doc #</th>
                <th>Description</th>
                <th>Charged</th>
                <th>Paid</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {settlement.settlementLineItems.map((item, index) => (
                <tr key={`${item.documentNumber}-${index}`} className="border-t border-stone-100">
                  <td className="py-1" dir="ltr">
                    {item.documentDate ?? "—"}
                  </td>
                  <td dir="ltr">{item.documentNumber ?? "—"}</td>
                  <td>{item.description || "—"}</td>
                  <td dir="ltr">{formatMoney(item.chargedAmount, settlement.currency ?? "ILS")}</td>
                  <td dir="ltr">{formatMoney(item.paidAmount, settlement.currency ?? "ILS")}</td>
                  <td dir="ltr">{formatMoney(item.outstandingAmount, settlement.currency ?? "ILS")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {settlement.invoiceLineItems.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium">Invoice lines</div>
          <table className="w-full text-right text-sm">
            <thead className="text-stone-500">
              <tr>
                <th className="py-1">#</th>
                <th>Description</th>
                <th>Qty</th>
                <th>UoM</th>
                <th>Unit</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {settlement.invoiceLineItems.map((item, index) => (
                <tr key={`${item.description}-${index}`} className="border-t border-stone-100">
                  <td className="py-1">{item.lineNumber ?? index + 1}</td>
                  <td>{item.description || "—"}</td>
                  <td>{item.quantity ?? "—"}</td>
                  <td>{item.unitOfMeasure ?? "—"}</td>
                  <td>{item.unitPrice ?? "—"}</td>
                  <td>{formatMoney(item.amount, settlement.currency ?? "ILS")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
