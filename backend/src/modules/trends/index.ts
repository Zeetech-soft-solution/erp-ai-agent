import { MCPModule } from "../../core/types";
import { systemConnector } from "../../config/system.config";
import { runPythonAnalysis } from "../../core/pythonAnalysis";

// Entities whose canonical rows carry the "date" and "total" fields the
// monthly_trend analysis reads (its data contract).
const TREND_ENTITIES = ["sales_invoice", "purchase_invoice", "sales_order", "purchase_order", "quotation"];
const ROW_CAP = 5000;

/**
 * Sample of the Python analytics engine: one named analysis, monthly
 * trend with growth and a projection. Rows are fetched through the
 * connector as the signed-in user (ERPNext permissions apply), handed to
 * Python, and only the computed summary goes back to the model.
 */
export const trendsModule: MCPModule = {
  name: "trends",
  description: "Python analytics engine: monthly trend analysis",
  tools: [
    {
      name: "analytics.monthly_trend",
      description:
        "Monthly trend of a transaction total over a date range, computed exactly by the analytics engine: total, average per month, a next-month projection, a line chart and written observations. Excludes draft and cancelled documents. Use for 'trend', 'month by month', 'growth' or 'forecast' questions about sales, purchases, orders or quotations.",
      module: "trends",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", enum: TREND_ENTITIES, description: "Which transaction to analyse" },
          from_date: { type: "string", description: "Start date, YYYY-MM-DD" },
          to_date: { type: "string", description: "End date, YYYY-MM-DD" },
        },
        required: ["entity", "from_date", "to_date"],
      },
      handler: async (args, session) => {
        if (!TREND_ENTITIES.includes(args.entity)) throw new Error(`entity must be one of: ${TREND_ENTITIES.join(", ")}`);
        const rows = await systemConnector.list(args.entity, session.credential, {
          filters: { date: ["between", [args.from_date, args.to_date]], status: ["not in", ["Draft", "Cancelled"]] },
          limit: ROW_CAP,
          sortBy: "date",
          sortDir: "asc",
        });
        const result = await runPythonAnalysis("monthly_trend", rows.map((r) => ({ date: r.date, total: r.total })));
        return {
          entity: args.entity,
          period: { from: args.from_date, to: args.to_date },
          records_analysed: rows.length,
          ...(rows.length >= ROW_CAP ? { note: `Only the first ${ROW_CAP} records were analysed; narrow the date range for a complete result.` } : {}),
          ...result,
        };
      },
    },
  ],
};
