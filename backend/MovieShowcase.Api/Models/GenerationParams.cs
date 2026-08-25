namespace MovieShowcase.Api.Models;

/// <summary>
/// Common request parameters shared by every movie endpoint. Bound directly
/// from the query string. Pagination / batching is endpoint-specific and not
/// part of this object.
/// </summary>
public class GenerationParams
{
    /// <summary>Locale code, e.g. <c>en-US</c>. Required (validated by the endpoint).</summary>
    public string Locale { get; set; } = "en-US";

    /// <summary>
    /// 48+ bit user-supplied seed. Stored as <see cref="long"/> so we can
    /// accept values up to <c>2^48 - 1</c> (and beyond) without truncation.
    /// </summary>
    public long Seed { get; set; } = 0;

    /// <summary>Target average likes per movie. Allowed range: [0, 10].</summary>
    public double LikesAvg { get; set; } = 1.0;

    /// <summary>Target average reviews per movie. Allowed range: [0, 10].</summary>
    public double ReviewsAvg { get; set; } = 1.0;
}
