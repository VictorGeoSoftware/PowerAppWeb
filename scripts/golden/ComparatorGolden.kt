// Golden-case generator for src/lib/comparator. Compiled together with the real BmApp
// sources by generate-comparator-golden.sh; prints JSON to stdout. Do not re-type BmApp
// logic here: only build inputs and call the BmApp classes.

import com.briel.marnisos.brielapp.data.utils.FormatUtils.formatEnergyDecimals
import com.briel.marnisos.brielapp.data.utils.FormatUtils.formatPriceDecimals
import com.briel.marnisos.brielapp.domain.calculations.ProposalCalculationHelper
import com.briel.marnisos.brielapp.domain.models.ComparatorSummaryModel
import com.briel.marnisos.brielapp.domain.models.ConsumptionSessionModel
import com.briel.marnisos.brielapp.domain.models.CurrentUserConditionsModel
import com.briel.marnisos.brielapp.domain.models.ProposalPriceModel
import com.briel.marnisos.brielapp.domain.usecases.CalculateComparatorSummaryUseCase
import com.briel.marnisos.brielapp.domain.usecases.SelectUncompetitiveProposalsUseCase
import com.briel.marnisos.brielapp.domain.usecases.create
import java.util.Locale
import kotlin.math.round
import kotlin.math.roundToInt

data class RawProposal(
    val title: String,
    val power: List<Double>,
    val annualPower: Double,
    val energy: List<Double>,
    val annualEnergy: Double,
    val extra: Double,
    val iva: Double,
    val tax: Double,
    val total: Double,
)

data class Case(
    val name: String,
    val hasSession: Boolean = true,
    val feeType: String = "3.0TD",
    val iva: Double = 21.0,
    val electricTax: Double = 5.11269632,
    val powerRows: List<Pair<String, Double>> = emptyList(),
    val energyRows: List<Pair<String, Double>> = emptyList(),
    val proposals: List<RawProposal> = emptyList(),
    val conditions: CurrentUserConditionsModel? = null,
    val fixed: Map<String, String> = emptyMap(),
)

// ---------- JSON ----------
fun q(s: String): String = buildString {
    append('"')
    s.forEach { c ->
        when (c) {
            '"' -> append("\\\"")
            '\\' -> append("\\\\")
            '\n' -> append("\\n")
            else -> if (c < ' ') append(String.format("\\u%04x", c.code)) else append(c)
        }
    }
    append('"')
}

fun n(d: Double): String {
    require(d.isFinite()) { "non-finite $d" }
    return d.toString()
}

fun arr(items: List<String>) = items.joinToString(",", "[", "]")
fun obj(entries: List<Pair<String, String>>) = entries.joinToString(",", "{", "}") { (k, v) -> "${q(k)}:$v" }
fun strMap(m: Map<String, String>) = obj(m.map { (k, v) -> k to q(v) })
fun rows(r: List<Pair<String, Double>>) = arr(r.map { (p, v) -> obj(listOf("period" to q(p), "value" to n(v))) })

fun rawProposalJson(p: RawProposal) = obj(
    listOf(
        "proposalTitle" to q(p.title),
        "powerTermItems" to arr(p.power.map(::n)),
        "annualPowerTermCost" to n(p.annualPower),
        "consumedEnergyItems" to arr(p.energy.map(::n)),
        "annualEnergyCost" to n(p.annualEnergy),
        "extraServices" to n(p.extra),
        "iva" to n(p.iva),
        "electricalTax" to n(p.tax),
        "totalAnnualPrice" to n(p.total),
    ),
)

fun proposalJson(p: ProposalPriceModel) = obj(
    listOf(
        "proposalTitle" to q(p.proposalTitle),
        "powerTermItems" to arr(p.powerTermItems.map(::n)),
        "annualPowerTermCost" to n(p.annualPowerTermCost),
        "consumedEnergyItems" to arr(p.consumedEnergyItems.map(::n)),
        "annualEnergyCost" to n(p.annualEnergyCost),
        "extraServices" to n(p.extraServices),
        "iva" to n(p.iva),
        "electricalTax" to n(p.electricalTax),
        "totalAnnualPrice" to n(p.totalAnnualPrice),
    ),
)

// Same mapping as ConsumptionReportMapper.ProposalPriceData.mapToDomain (data class needs
// kotlinx.serialization, so the field-by-field copy is repeated; the rounding is FormatUtils).
fun RawProposal.toDomain() = ProposalPriceModel(
    proposalTitle = title,
    powerTermItems = power.formatEnergyDecimals(),
    annualPowerTermCost = annualPower.formatPriceDecimals(),
    consumedEnergyItems = energy.formatEnergyDecimals(),
    annualEnergyCost = annualEnergy.formatPriceDecimals(),
    extraServices = extra,
    iva = iva,
    electricalTax = tax.formatPriceDecimals(),
    totalAnnualPrice = total.formatPriceDecimals(),
)

val calculate = CalculateComparatorSummaryUseCase.create(ProposalCalculationHelper())
val selectUncompetitive = SelectUncompetitiveProposalsUseCase()

fun caseJson(c: Case): String {
    val session = if (!c.hasSession) null else ConsumptionSessionModel(
        jobId = "job",
        tariffName = c.feeType,
        ivaPercent = c.iva,
        electricTaxPercent = c.electricTax,
        powerTermRows = c.powerRows,
        // ConsumptionSessionRepositoryImpl.updateFromReport truncates energy to Int.
        energyConsumedRows = c.energyRows.map { (p, v) -> p to v.toInt() },
        supplyHolder = "",
        supplyAddress = "",
        supplyCupsCode = "",
        proposals = c.proposals.map { it.toDomain() },
    )
    val summary: ComparatorSummaryModel = calculate(session, c.conditions, c.fixed)
    val cc = summary.customerConditions
    val input = obj(
        listOf(
            "session" to if (session == null) "null" else obj(
                listOf(
                    "feeType" to q(c.feeType),
                    "iva" to n(c.iva),
                    "electricTaxPercent" to n(c.electricTax),
                    "powerRows" to rows(c.powerRows),
                    "energyRows" to rows(c.energyRows),
                    "proposals" to arr(c.proposals.map(::rawProposalJson)),
                ),
            ),
            "conditions" to (c.conditions?.let {
                obj(
                    listOf(
                        "companyName" to q(it.companyName),
                        "powerTermPriceByPeriod" to strMap(it.powerTermPriceByPeriod),
                        "energyPriceByPeriod" to strMap(it.energyPriceByPeriod),
                        "extraServices" to q(it.extraServices),
                    ),
                )
            } ?: "null"),
            "fixedAmountByTitle" to strMap(c.fixed),
        ),
    )
    val expected = obj(
        listOf(
            "proposals" to arr(summary.proposals.map(::proposalJson)),
            "customerConditions" to obj(
                listOf(
                    "powerTermItems" to arr(cc.powerTermItems.map(::n)),
                    "annualPowerTermCost" to q(cc.annualPowerTermCost),
                    "consumedEnergyItems" to arr(cc.consumedEnergyItems.map(::n)),
                    "annualEnergyCost" to q(cc.annualEnergyCost),
                    "extraServices" to q(cc.extraServices),
                    "electricTax" to q(cc.electricTax),
                    "iva" to q(cc.iva),
                    "totalAnnualPrice" to q(cc.totalAnnualPrice),
                ),
            ),
            "customerTotalAnnualPrice" to n(summary.customerTotalAnnualPrice),
            "annualPriceDeltaByTitle" to obj(summary.annualPriceDeltaByTitle.map { (k, v) -> k to n(v) }),
            "annualSavingsPercentageByTitle" to obj(summary.annualSavingsPercentageByTitle.map { (k, v) -> k to v.toString() }),
            "bestProposalTitle" to (summary.bestProposalAmong(summary.proposals)?.proposalTitle?.let(::q) ?: "null"),
            "uncompetitiveTitles" to arr(selectUncompetitive(summary).sorted().map(::q)),
            "uncompetitiveTitlesThreshold25" to arr(selectUncompetitive(summary, 25).sorted().map(::q)),
        ),
    )
    return obj(listOf("name" to q(c.name), "input" to input, "expected" to expected))
}

// ---------- primitive goldens (stdlib behaviour the port must reproduce) ----------
val decimalInputs = listOf(
    "", " ", "0", "1", "1,5", "1.5", "1.", ",5", ".5", "0,123456", "12,345", "abc", "1,2,3",
    "-3", "1e3", " 2 ", "0,000001", "007", "1.0000005", "1d",
)

val formatValues = listOf(
    0.0, 1.005, 1.015, 1.025, 2.675, 0.125, 0.135, 1.0E-7, 123456.785, 0.0000005, 0.0000015, 0.1234565,
    1.2345675, 99.995, 1.4999999999999998, 5.0E-3, 0.015, 7.885, -1.005, -2.5, 1234.5, 0.285, 10.235,
    0.123456789, 1.0E-5, 3.0E-5, 1.23456E7, 2.5E-6, 0.0000025, 1.1E-6,
)

fun roundToTwo(d: Double) = round(d * 100.0) / 100.0

fun primitivesJson(): String {
    val parse = decimalInputs.map { s ->
        val v = if (s.isBlank()) 0.0 else s.replace(',', '.').toDoubleOrNull() ?: 0.0
        obj(listOf("input" to q(s), "value" to n(v)))
    }
    val formats = formatValues.map { v ->
        obj(
            listOf(
                "value" to n(v),
                "f2" to q(String.format(Locale.US, "%.2f", v)),
                "f6" to q(String.format(Locale.US, "%.6f", v)),
                "round2" to n(roundToTwo(v)),
                "roundToInt" to v.roundToInt().toString(),
            ),
        )
    }
    return obj(listOf("parseDecimal" to arr(parse), "format" to arr(formats)))
}

// ---------- cases ----------
fun cond(
    power: Map<String, String>,
    energy: Map<String, String>,
    extra: String = "",
    company: String = "Iberdrola",
) = CurrentUserConditionsModel(company, power, energy, extra)

val p6 = listOf("P1", "P2", "P3", "P4", "P5", "P6")

fun prop(title: String, total: Double, n: Int = 6, seed: Double = 1.0) = RawProposal(
    title = title,
    power = (1..n).map { 0.0712345678 * seed / it },
    annualPower = total * 0.3,
    energy = (1..n).map { 0.1234567891 * seed / it },
    annualEnergy = total * 0.55,
    extra = 0.0,
    iva = total * 0.21 / 1.21,
    tax = total * 0.04,
    total = total,
)

class Lcg(var s: Long) {
    fun next(): Double {
        s = (s * 6364136223846793005L + 1442695040888963407L)
        return ((s ushr 11).toDouble() / (1L shl 53).toDouble())
    }
}

fun fmtPrice(r: Lcg, v: Double): String {
    val s = String.format(Locale.US, "%.${1 + (r.next() * 6).toInt()}f", v)
    return if (r.next() < 0.5) s.replace('.', ',') else s
}

fun randomCases(): List<Case> {
    val r = Lcg(20261019L)
    return (1..30).map { i ->
        val twoTd = r.next() < 0.4
        val powerPeriods = if (twoTd) listOf("P1", "P2") else p6
        val energyPeriods = if (twoTd) listOf("P1", "P2", "P3") else p6
        val powerRows = powerPeriods.map { it to listOf(3.45, 4.6, 5.75, 9.2, 15.0, 33.0, 50.123)[(r.next() * 7).toInt()] }
        val energyRows = energyPeriods.map { it to round(r.next() * 20000.0 * 1000.0) / 1000.0 }
        val proposals = (1..(1 + (r.next() * 6).toInt())).map { k ->
            val base = 300.0 + r.next() * 8000.0
            RawProposal(
                title = "Prop $k",
                power = powerPeriods.map { r.next() * 0.2 },
                annualPower = base * 0.3 + r.next(),
                energy = energyPeriods.map { r.next() * 0.3 },
                annualEnergy = base * 0.6 + r.next(),
                extra = if (r.next() < 0.3) round(r.next() * 5000.0) / 100.0 else 0.0,
                iva = base * 0.21 + r.next() / 1000.0,
                tax = base * 0.051 + r.next() / 1000.0,
                total = base * 1.3 + r.next() / 1000.0,
            )
        }
        val conditions = if (r.next() < 0.1) null else cond(
            powerPeriods.associateWith { fmtPrice(r, r.next() * 0.2) },
            energyPeriods.associateWith { fmtPrice(r, r.next() * 0.3) },
            extra = if (r.next() < 0.5) "" else fmtPrice(r, r.next() * 60.0),
        )
        val fixed = proposals.filter { r.next() < 0.4 }.associate { it.title to fmtPrice(r, r.next() * 200.0 - 20.0) }
        Case(
            name = "random $i",
            feeType = if (twoTd) "2.0TD" else "3.0TD",
            iva = listOf(21.0, 10.0, 5.0)[(r.next() * 3).toInt()],
            electricTax = listOf(5.11269632, 3.8, 0.5)[(r.next() * 3).toInt()],
            powerRows = powerRows,
            energyRows = energyRows,
            proposals = proposals,
            conditions = conditions,
            fixed = fixed,
        )
    }
}

val twoTdPower = listOf("P1" to 4.6, "P2" to 4.6)
val twoTdEnergy = listOf("P1" to 1234.7, "P2" to 987.2, "P3" to 2100.9)
val twoTdCond = cond(mapOf("P1" to "0,108192", "P2" to "0,033356"), mapOf("P1" to "0,1543", "P2" to "0,1123", "P3" to "0,0898"))
val threeTdPower = p6.map { it to 15.0 }
val threeTdEnergy = p6.zip(listOf(5000.4, 4000.9, 3000.5, 2000.0, 1500.99, 9000.1))
val threeTdCond = cond(
    p6.zip(listOf("0,0391", "0,0203", "0,0087", "0,0076", "0,0049", "0,0029")).toMap(),
    p6.zip(listOf("0,181", "0,165", "0,149", "0,139", "0,129", "0,119")).toMap(),
    extra = "12,5",
)

val handCases = listOf(
    Case(name = "no session", hasSession = false, conditions = twoTdCond),
    Case(name = "2.0TD typical", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy,
        proposals = listOf(prop("A", 900.0, 3), prop("B", 1100.0, 3), prop("C", 1500.0, 3)), conditions = twoTdCond),
    Case(name = "3.0TD typical with extra services", powerRows = threeTdPower, energyRows = threeTdEnergy,
        proposals = listOf(prop("A", 3000.0), prop("B", 4100.0, seed = 1.3), prop("C", 5200.0, seed = 0.7)), conditions = threeTdCond),
    Case(name = "conditions null", powerRows = threeTdPower, energyRows = threeTdEnergy,
        proposals = listOf(prop("A", 3000.0)), conditions = null, fixed = mapOf("A" to "10")),
    Case(name = "all prices empty", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy,
        proposals = listOf(prop("A", 900.0, 3)), conditions = cond(mapOf("P1" to "", "P2" to ""), mapOf("P1" to "", "P2" to "", "P3" to ""), extra = "50")),
    Case(name = "all prices zero", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy,
        proposals = listOf(prop("A", 900.0, 3)), conditions = cond(mapOf("P1" to "0", "P2" to "0,0"), mapOf("P1" to "0", "P2" to "0", "P3" to "0"))),
    Case(name = "only energy prices", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy,
        proposals = listOf(prop("A", 300.0, 3)), conditions = cond(emptyMap(), mapOf("P1" to "0,15", "P2" to "0,1", "P3" to "0,09"))),
    Case(name = "odd decimal inputs", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy,
        proposals = listOf(prop("A", 900.0, 3)), conditions = cond(mapOf("P1" to "1.", "P2" to ",5"), mapOf("P1" to "", "P2" to "abc", "P3" to "0,1"), extra = "1.")),
    Case(name = "fixed amounts zero negative blank invalid", powerRows = threeTdPower, energyRows = threeTdEnergy,
        proposals = listOf(prop("A", 3000.0), prop("B", 3100.0), prop("C", 3200.0), prop("D", 3300.0), prop("E", 3400.0)),
        conditions = threeTdCond, fixed = mapOf("A" to "0", "B" to "-5", "C" to "", "D" to "abc", "E" to "12,5")),
    Case(name = "fixed amount IVA 10", iva = 10.0, powerRows = threeTdPower, energyRows = threeTdEnergy,
        proposals = listOf(prop("A", 3000.0)), conditions = threeTdCond, fixed = mapOf("A" to "33,335")),
    Case(name = "fixed amount IVA 5 on unknown title", iva = 5.0, powerRows = threeTdPower, energyRows = threeTdEnergy,
        proposals = listOf(prop("A", 3000.0)), conditions = threeTdCond, fixed = mapOf("Z" to "100")),
    Case(name = "all proposals uncompetitive", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy,
        proposals = listOf(prop("A", 5000.0, 3), prop("B", 4000.0, 3), prop("C", 6000.0, 3)), conditions = twoTdCond),
    Case(name = "proposal more expensive than customer", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy,
        proposals = listOf(prop("A", 1000.0, 3), prop("B", 400.0, 3)), conditions = twoTdCond),
    Case(name = "duplicate titles", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy,
        proposals = listOf(prop("Dup", 500.0, 3), prop("Dup", 450.0, 3), prop("Other", 700.0, 3)), conditions = twoTdCond,
        fixed = mapOf("Dup" to "5")),
    Case(name = "no proposals", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy, conditions = twoTdCond),
    Case(name = "fractional kwh below one", feeType = "2.0TD", powerRows = twoTdPower,
        energyRows = listOf("P1" to 0.4, "P2" to 1.999, "P3" to 10.5), proposals = listOf(prop("A", 20.0, 3)),
        conditions = cond(mapOf("P1" to "0,1", "P2" to "0,05"), mapOf("P1" to "0,2", "P2" to "0,2", "P3" to "0,2"))),
    // power cost 1 kW * 0.001 * 365 = 0.365 -> exact .xx5 style ties for round/half-even and %.2f
    Case(name = "rounding ties", feeType = "2.0TD", iva = 0.0, electricTax = 0.0,
        powerRows = listOf("P1" to 1.0, "P2" to 0.5), energyRows = listOf("P1" to 1.0, "P2" to 1.0, "P3" to 3.0),
        proposals = listOf(prop("A", 0.125, 3), prop("B", 1.005, 3), prop("C", 2.675, 3)),
        conditions = cond(mapOf("P1" to "0,001", "P2" to "0,001"), mapOf("P1" to "0,005", "P2" to "0,0", "P3" to "0,035"), extra = "0,125")),
    Case(name = "rounding ties 2", feeType = "2.0TD", iva = 10.0, electricTax = 0.0,
        powerRows = listOf("P1" to 2.0, "P2" to 2.0), energyRows = listOf("P1" to 100.0, "P2" to 100.0, "P3" to 100.0),
        proposals = listOf(prop("A", 10.0, 3)),
        conditions = cond(mapOf("P1" to "0,00025", "P2" to "0"), mapOf("P1" to "0,000125", "P2" to "0,0003", "P3" to "0,00125"), extra = "0,005"),
        fixed = mapOf("A" to "0,05")),
    Case(name = "savings percentage halves", feeType = "2.0TD", iva = 0.0, electricTax = 0.0,
        powerRows = listOf("P1" to 1.0, "P2" to 1.0), energyRows = listOf("P1" to 1000.0, "P2" to 0.0, "P3" to 0.0),
        proposals = listOf(prop("A", 92.5, 3), prop("B", 107.5, 3), prop("C", 115.0, 3), prop("D", 114.9, 3)),
        conditions = cond(mapOf("P1" to "0", "P2" to "0"), mapOf("P1" to "0,1", "P2" to "0", "P3" to "0"))),
    Case(name = "large consumption", powerRows = p6.map { it to 450.0 }, energyRows = p6.map { it to 1234567.891 },
        proposals = listOf(prop("A", 1_500_000.0), prop("B", 2_000_000.0)), conditions = threeTdCond),
    Case(name = "conditions with extra periods ignored", feeType = "2.0TD", powerRows = twoTdPower, energyRows = twoTdEnergy,
        proposals = listOf(prop("A", 900.0, 3)),
        conditions = cond(mapOf("P1" to "0,1", "P2" to "0,03", "P3" to "9"), mapOf("P1" to "0,15", "P2" to "0,11", "P3" to "0,09", "P6" to "9"))),
)

fun main() {
    val cases = (handCases + randomCases()).map(::caseJson)
    println(obj(listOf("generatedFrom" to q("BmApp sources via scripts/golden/generate-comparator-golden.sh"), "primitives" to primitivesJson(), "cases" to arr(cases))))
}
